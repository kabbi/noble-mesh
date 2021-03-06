const debug = require('debug')('mesh:layers:network');

const binary = require('../utils/binary');
const packetTypeSet = require('../packets');
const { acceptSeq, nextSeq } = require('../utils/seq-provider');
const EventEmitter = require('../utils/event-emitter');
const {
  deobfuscateMeta,
  obfuscateMeta,
  primitives,
} = require('../utils/mesh-crypto');

const { parse, write } = binary(packetTypeSet);

class NetworkLayer extends EventEmitter {
  constructor(keychain) {
    super();
    this.keychain = keychain;
    this.ivIndex = 0;
  }

  getNetworkNonce(meta) {
    return write('Nonce', {
      type: 'Network',
      payload: {
        ivIndex: this.ivIndex,
        ...meta,
      },
    });
  }

  handleIncoming(data, nonce) {
    debug('handling incoming message %h', data);

    let pdu;
    try {
      pdu = parse('NetworkPDU', data);
    } catch (error) {
      debug('dropping malformed message %o', error);
      return;
    }

    const key = this.keychain.getNetworkKeyByNID(pdu.nid);
    if (!key) {
      debug('dropping message with wrong nid, %d', pdu.nid);
      return;
    }

    const meta = parse(
      'NetworkMeta',
      deobfuscateMeta(key.privacyKey, this.ivIndex, pdu),
    );
    const micLength = meta.ctl ? 8 : 4;
    const payload = primitives.decrypt(
      key.encryptionKey,
      nonce || this.getNetworkNonce(meta),
      pdu.encryptedPart.slice(0, -micLength),
      pdu.encryptedPart.slice(-micLength),
    );

    if (!payload) {
      debug('dropping message cannot decrypt');
      return;
    }

    meta.dst = parse('uint16', payload);
    if (!acceptSeq(meta.dst.toString(16).padStart(4, '0'), meta.seq)) {
      debug('dropping duplicate message with seq %d', meta.seq);
      return;
    }

    const networkPayload = payload.slice(2);
    debug('got incoming message: %O, %h', meta, networkPayload);
    this.emit('incoming', {
      payload: networkPayload,
      meta: {
        type: meta.ctl ? 'control' : 'access',
        from: meta.src,
        to: meta.dst,
        ttl: meta.ttl,
        seq: meta.seq,
      },
    });
  }

  handleOutgoing(message) {
    debug('handling outgoing message %h', message.payload);
    const networkPayload = Buffer.concat(
      [write('uint16', message.meta.to), message.payload],
      message.payload.length + 2,
    );
    const meta = {
      ctl: message.meta.type === 'control',
      seq:
        message.meta.seq != null
          ? message.meta.seq
          : nextSeq(message.meta.from.toString(16).padStart(4, '0')),
      ttl: message.meta.ttl != null ? message.meta.ttl : 100,
      src: message.meta.from,
      dst: message.meta.to,
    };
    const firstKey = this.keychain.networkKeys[0];
    const { payload, mic } = primitives.encrypt(
      firstKey.encryptionKey,
      message.nonce || this.getNetworkNonce(meta),
      networkPayload,
      meta.ctl ? 8 : 4,
    );
    const encryptedPart = Buffer.concat([payload, mic]);
    const obfuscatedPart = write('NetworkMeta', meta);
    const pdu = obfuscateMeta(firstKey.privacyKey, this.ivIndex, {
      nid: firstKey.nid,
      ivi: this.ivIndex & 1,
      obfuscatedPart,
      encryptedPart,
    });
    this.emit('outgoing', write('NetworkPDU', pdu));
  }
}

module.exports = NetworkLayer;
