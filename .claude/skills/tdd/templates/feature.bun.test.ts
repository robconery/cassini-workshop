/**
 * TDD test file — bun:test
 *
 * Run with: bun test
 *
 * These tests are written FIRST and are the spec the builder implements
 * against. Read them top to bottom: each `test` name is a sentence about one
 * behavior, the body is Arrange / Act / Assert, and there is exactly one
 * assertion per test.
 *
 * `ShoppingCart` does not need to exist yet — these tests are expected to fail
 * first (red). Replace the import target and calls with the real subject as it
 * is built.
 *
 * Conventions to keep:
 *   - Name the behavior, not the method.
 *   - Arrange, blank line, Act, blank line, Assert.
 *   - One assertion per test. Real, typed, intent-revealing data.
 *   - Happy path first and thorough; failure cases segregated below.
 */
import { test, expect, describe } from "bun:test";

import { ShoppingCart, CartError } from "../src/shopping-cart";

// ---------------------------------------------------------------------------
// HAPPY PATH — the success behaviors, first and exhaustive.
// ---------------------------------------------------------------------------

test("starts empty", () => {
  const cart = new ShoppingCart();

  expect(cart.isEmpty).toBe(true);
});

test("holds one line item per distinct SKU added", () => {
  const cart = new ShoppingCart();

  cart.add({ sku: "widget", unitPrice: 5, quantity: 2 });
  cart.add({ sku: "gadget", unitPrice: 10, quantity: 1 });

  expect(cart.lineItems).toHaveLength(2);
});

test("totals the cart from each line's price times quantity", () => {
  const cart = new ShoppingCart();

  cart.add({ sku: "widget", unitPrice: 5, quantity: 2 }); // 10
  cart.add({ sku: "gadget", unitPrice: 10, quantity: 1 }); // 10

  expect(cart.total).toBe(20);
});

test("merges quantities when the same SKU is added twice", () => {
  const cart = new ShoppingCart();

  cart.add({ sku: "widget", unitPrice: 5, quantity: 1 });
  cart.add({ sku: "widget", unitPrice: 5, quantity: 3 });

  expect(cart.quantityOf("widget")).toBe(4);
});

test("keeps a single line item after merging the same SKU", () => {
  const cart = new ShoppingCart();

  cart.add({ sku: "widget", unitPrice: 5, quantity: 1 });
  cart.add({ sku: "widget", unitPrice: 5, quantity: 3 });

  expect(cart.lineItems).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// FAILURE CASES — segregated below, one behavior per test.
// ---------------------------------------------------------------------------

describe("rejecting invalid input", () => {
  test("rejects a quantity of zero", () => {
    const cart = new ShoppingCart();

    const add = () => cart.add({ sku: "widget", unitPrice: 5, quantity: 0 });

    expect(add).toThrow(CartError);
  });

  test("rejects a negative unit price", () => {
    const cart = new ShoppingCart();

    const add = () => cart.add({ sku: "widget", unitPrice: -1, quantity: 1 });

    expect(add).toThrow(CartError);
  });
});
