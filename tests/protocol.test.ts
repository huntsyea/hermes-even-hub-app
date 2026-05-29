import { describe, it, expect } from "vitest";
import { hello, parseServer, audioStart, audioStop } from "../src/protocol";

describe("protocol", () => {
  it("builds a hello frame", () => {
    expect(JSON.parse(hello("tok", "g2"))).toEqual({ t: "hello", token: "tok", device: "g2" });
  });
  it("parses an assistant frame", () => {
    const msg = parseServer(JSON.stringify({ t: "assistant", text: "hi" }));
    expect(msg).toEqual({ t: "assistant", text: "hi" });
  });
  it("rejects unknown types", () => {
    expect(() => parseServer(JSON.stringify({ t: "nope" }))).toThrow();
  });
  it("builds audio control frames", () => {
    expect(JSON.parse(audioStart())).toEqual({ t: "audio.start" });
    expect(JSON.parse(audioStop())).toEqual({ t: "audio.stop" });
  });
});
