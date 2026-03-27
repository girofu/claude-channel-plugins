import { describe, it, expect } from "vitest";
import { requireEnv, requireArg, optionalArg, type ScriptResult } from "../scripts/helpers.js";

describe("Script helpers", () => {
  describe("requireEnv", () => {
    it("returns the value when env var exists", () => {
      process.env.TEST_HELPERS_VAR = "hello";
      expect(requireEnv("TEST_HELPERS_VAR")).toBe("hello");
      delete process.env.TEST_HELPERS_VAR;
    });

    it("throws when env var is missing", () => {
      delete process.env.NONEXISTENT_VAR;
      expect(() => requireEnv("NONEXISTENT_VAR")).toThrow(
        "Missing required environment variable: NONEXISTENT_VAR",
      );
    });

    it("throws when env var is empty string", () => {
      process.env.EMPTY_VAR = "";
      expect(() => requireEnv("EMPTY_VAR")).toThrow(
        "Missing required environment variable: EMPTY_VAR",
      );
      delete process.env.EMPTY_VAR;
    });
  });

  describe("requireArg", () => {
    it("returns the argument at the given index", () => {
      const origArgv = process.argv;
      process.argv = ["node", "script.ts", "discord", "extra"];
      expect(requireArg(0, "channel")).toBe("discord");
      expect(requireArg(1, "extra")).toBe("extra");
      process.argv = origArgv;
    });

    it("throws when argument is missing", () => {
      const origArgv = process.argv;
      process.argv = ["node", "script.ts"];
      expect(() => requireArg(0, "channel")).toThrow(
        "Missing required argument: channel (position 0)",
      );
      process.argv = origArgv;
    });
  });

  describe("optionalArg", () => {
    it("returns the argument when present", () => {
      const origArgv = process.argv;
      process.argv = ["node", "script.ts", "value"];
      expect(optionalArg(0)).toBe("value");
      process.argv = origArgv;
    });

    it("returns undefined when argument is missing", () => {
      const origArgv = process.argv;
      process.argv = ["node", "script.ts"];
      expect(optionalArg(0)).toBeUndefined();
      process.argv = origArgv;
    });
  });

  describe("ScriptResult type", () => {
    it("represents a success result", () => {
      const result: ScriptResult<{ name: string }> = {
        success: true,
        data: { name: "test" },
      };
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("test");
    });

    it("represents an error result", () => {
      const result: ScriptResult = {
        success: false,
        error: "something went wrong",
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe("something went wrong");
    });
  });
});
