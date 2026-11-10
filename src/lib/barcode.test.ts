import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBarcode, expandUPCE } from "./barcode";
test("accepts EAN-13, UPC-A and EAN-8 with valid check digits", () => {
  for (const code of ["4006381333931", "036000291452", "96385074"])
    assert.equal(validateBarcode(code), code);
});
test("rejects invalid checksums, malformed input and empty codes", () => {
  for (const code of [
    "4006381333932",
    "00000000",
    "123",
    "abcd",
    "",
    "036000291453",
  ])
    assert.equal(validateBarcode(code), null);
});
test("normalizes separators and retains leading zeros", () =>
  assert.equal(validateBarcode("0 36000-291452"), "036000291452"));
test("expands and validates UPC-E", () => {
  assert.equal(expandUPCE("04252614"), "042100005264");
  assert.equal(expandUPCE("04252615"), null);
});
