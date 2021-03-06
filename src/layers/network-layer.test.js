const NetworkLayer = require("./network-layer");
const createBinary = require("../utils/binary");
const { hex } = require("../utils/tags");
const Keychain = require("../keychain");
const typeSet = require("../packets");

const { parse, write } = createBinary(typeSet);

describe("network-layer", () => {
  it("decrypts test message", () => {
    const layer = new NetworkLayer(
      new Keychain(hex`2109E653D1E8265E3F453D462A569443`)
    );
    const listener = jest.fn();
    layer.on("incoming", listener);
    layer.handleIncoming(hex`66B708C00FD0B25C01E1364496561405E4EC55E347E32F8A`);
    expect(listener).toHaveBeenCalledWith({
      meta: { seq: 4, ttl: 7, from: 1, to: 0x7ff, type: "access" },
      payload: hex`00135f2f2eb792de09ad71`
    });
  });

  it("sends something", () => {
    const layer = new NetworkLayer(
      new Keychain(hex`2109E653D1E8265E3F453D462A569443`)
    );
    const listener = jest.fn();
    layer.on("outgoing", listener);
    layer.handleOutgoing({
      meta: { seq: 4, ttl: 7, from: 1, to: 0x7ff, type: "access" },
      payload: hex`00135f2f2eb792de09ad71`
    });
    expect(listener).toHaveBeenCalledWith(
      hex`66B708C00FD0B25C01E1364496561405E4EC55E347E32F8A`
    );
  });

  it("cycles around", () => {
    const layer = new NetworkLayer(
      new Keychain(hex`1234567890ABCDEF1234567890ABCDEF`)
    );
    const listener = jest.fn();
    layer.on("incoming", listener);
    layer.on("outgoing", (data) => {
      layer.handleIncoming(data);
    });
    layer.handleOutgoing({
      meta: { seq: 1, ttl: 2, from: 3, to: 4, type: "control" },
      payload: hex`9876543210`
    });
    expect(listener).toHaveBeenCalledWith({
      meta: { seq: 1, ttl: 2, from: 3, to: 4, type: "control" },
      payload: hex`9876543210`
    });
  });

  it("parses proxy message", () => {
    const layer = new NetworkLayer(
      new Keychain(hex`7D9C82EAD54C3B77527104CE609BD77C`)
    );
    const listener = jest.fn();
    layer.on("incoming", listener);
    layer.handleIncoming(
      hex`4743A9AC43633A574EFA2B37AB890443C04FB36764`,
      write("Nonce", {
        type: "Proxy",
        payload: {
          ivIndex: 0,
          src: 5,
          seq: 128
        }
      })
    );
    expect(listener).toHaveBeenCalledWith({
      meta: { seq: 128, ttl: 127, from: 5, to: 0, type: "control" },
      payload: hex`03010000`
    });
  });
});
