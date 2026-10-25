import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  AbiValidationError,
  canonicalStringify,
  countAbi,
  extractAbi,
  hashAbi,
  normalizeAbi,
  splitArrayType,
} from "./normalize";
import { parameterComponents } from "./utils";

const erc20Fragment = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

describe("extractAbi", () => {
  it("accepts a bare array", () => {
    expect(extractAbi(erc20Fragment)).toEqual(erc20Fragment);
  });

  it("accepts an artifact with an abi field", () => {
    expect(extractAbi({ abi: erc20Fragment, bytecode: "0x" })).toEqual(
      erc20Fragment,
    );
  });

  it("accepts a stringified result", () => {
    expect(extractAbi(JSON.stringify(erc20Fragment))).toEqual(erc20Fragment);
  });

  it("rejects unrelated objects", () => {
    expect(() => extractAbi({ nope: true })).toThrow(AbiValidationError);
  });
});

describe("splitArrayType", () => {
  it("separates nested array dimensions", () => {
    expect(splitArrayType("uint256[2][]")).toEqual({
      base: "uint256",
      dimensions: [null, 2],
    });
  });

  it("keeps bare tuple types intact", () => {
    expect(splitArrayType("tuple")).toEqual({
      base: "tuple",
      dimensions: [],
    });
  });
});

describe("normalizeAbi", () => {
  it("counts reads, writes, events, and errors", () => {
    const result = normalizeAbi([
      ...erc20Fragment,
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
      {
        type: "error",
        name: "InsufficientBalance",
        inputs: [{ name: "available", type: "uint256" }],
      },
    ]);

    expect(result.counts).toMatchObject({
      functions: 2,
      readFunctions: 1,
      writeFunctions: 1,
      events: 1,
      errors: 1,
    });
    expect(result.warnings).toEqual([]);
  });

  it("produces a stable hash regardless of object key order", () => {
    const reordered = erc20Fragment.map((item) => {
      const entries = Object.entries(item).reverse();
      return Object.fromEntries(entries);
    });

    expect(hashAbi(reordered)).toBe(hashAbi(erc20Fragment));
  });

  it("produces different hashes for different interfaces", () => {
    const other = [
      {
        type: "function",
        name: "totalSupply",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
      },
    ];
    expect(hashAbi(other)).not.toBe(hashAbi(erc20Fragment));
  });

  it("skips duplicate signatures with a warning", () => {
    const result = normalizeAbi([erc20Fragment[0], erc20Fragment[0]]);
    expect(result.counts.functions).toBe(1);
    expect(result.warnings[0]).toMatch(/Duplicate/);
  });

  it("keeps overloaded functions as distinct items", () => {
    const result = normalizeAbi([
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [{ name: "to", type: "address" }],
        outputs: [],
      },
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      },
    ]);

    expect(result.counts.functions).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("reports independent issues for each invalid item", () => {
    expect.assertions(3);
    try {
      normalizeAbi([
        { type: "function", name: "a", inputs: [{ type: "uint7" }], outputs: [] },
        { type: "function", name: "b", inputs: [{ type: "bytes33" }], outputs: [] },
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(AbiValidationError);
      const issues = (error as AbiValidationError).issues;
      expect(issues.some((issue) => issue.startsWith("abi[0]"))).toBe(true);
      expect(issues.some((issue) => issue.startsWith("abi[1]"))).toBe(true);
    }
  });

  it("rejects an empty ABI", () => {
    expect(() => normalizeAbi([])).toThrow(/empty/i);
  });

  it("normalizes nested tuple parameters", () => {
    const result = normalizeAbi([
      {
        type: "function",
        name: "submit",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "order",
            type: "tuple[]",
            components: [
              { name: "maker", type: "address" },
              { name: "amounts", type: "uint256[2]" },
            ],
          },
        ],
        outputs: [],
      },
    ]);

    const [fn] = result.abi;
    expect(fn.type).toBe("function");
    if (fn.type !== "function") return;
    expect(fn.inputs[0].type).toBe("tuple[]");
    expect(parameterComponents(fn.inputs[0])).toHaveLength(2);
  });
});

describe("countAbi", () => {
  it("ignores non-function items in method counts", () => {
    const result = normalizeAbi(erc20Fragment);
    expect(countAbi(result.abi)).toMatchObject({
      functions: 1,
      events: 1,
      errors: 0,
    });
  });
});

describe("canonicalStringify", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it("normalizes bigint values", () => {
    expect(canonicalStringify({ value: 5n })).toBe('{"value":"5"}');
  });
});

describe("address normalization", () => {
  it("keeps the EIP-55 checksum when validating inputs", () => {
    expect(getAddress("0x000000000000000000000000000000000000dead")).toBe(
      "0x000000000000000000000000000000000000dEaD",
    );
  });
});
