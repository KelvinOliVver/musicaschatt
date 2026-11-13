import { describe, expect, it } from "bun:test";
import { mayUseKickPlayerCommands, parseKickPlayerCommand } from "./kick-commands";

describe("Kick player commands", () => {
  it("recognizes aliases regardless of whitespace/case", () => {
    expect(parseKickPlayerCommand(" !SKIP ")).toBe("!skip");
    expect(parseKickPlayerCommand("!pular")).toBe("!skip");
    expect(parseKickPlayerCommand("!próxima")).toBe("!skip");
    expect(parseKickPlayerCommand("!pause")).toBe("!pausar");
    expect(parseKickPlayerCommand("!resume")).toBe("!continuar");
    expect(parseKickPlayerCommand("!limparfila")).toBe("!limpar");
    expect(parseKickPlayerCommand("!skip not now")).toBeNull();
    expect(parseKickPlayerCommand("hello")).toBeNull();
  });
  it("accepts streamer, authorized moderator and Kick MOD badge", () => {
    expect(mayUseKickPlayerCommands("RoceiraPlay", "roceiraplay", [])).toBe(true);
    expect(mayUseKickPlayerCommands("Pitee4", "roceiraplay", [], ["moderator"])).toBe(true);
    expect(mayUseKickPlayerCommands("Pitee4", "roceiraplay", [], ["MOD"])).toBe(true);
    expect(mayUseKickPlayerCommands("Other", "roceiraplay", ["other"])).toBe(true);
    expect(mayUseKickPlayerCommands("viewer", "roceiraplay", [], ["vip"])).toBe(false);
    expect(mayUseKickPlayerCommands("viewer", "roceiraplay", [])).toBe(false);
    expect(mayUseKickPlayerCommands("", "roceiraplay", [], ["moderator"])).toBe(false);
  });
});
