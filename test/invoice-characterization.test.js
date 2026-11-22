'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function buildBilledOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 41,
    date: '22/11/2026',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice figures match recorded billed GST and total for HSN items', function () {
  var order = buildBilledOrder([
    { id: 5, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 1 }
  ]);
  var printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: printed.subtotal, discount: printed.discount, tax: printed.tax, total: printed.total },
    { subtotal: order.subtotal, discount: order.discount, tax: order.tax, total: order.total }
  );
});

test('invoice applies the billed HSN slab and total', function () {
  var order = buildBilledOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 1 }
  ]);
  var printed = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 5);
  assert.equal(order.total, 105);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, order.tax);
  assert.equal(printed.total, order.total);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice uses the billed percent coupon discount and total', function () {
  var order = buildBilledOrder([
    { id: 2, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 1000, qty: 1 }
  ], 'SAVE10');
  var printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: order.discount, tax: order.tax, total: order.total }
  );
});

test('invoice line GST and CGST/SGST use the post-discount billed tax', function () {
  var order = buildBilledOrder([
    { id: 3, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 1000, qty: 1 }
  ], 'SAVE10');
  var printed = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 45);
  assert.equal(printed.rows[0].lineTax, 45);
  assert.equal(printed.tax, order.tax);
  assert.equal(printed.cgst, 22.5);
  assert.equal(printed.sgst, 22.5);
});

test('GST reconciliation matches billed totals and skips cancelled orders', function () {
  var order = buildBilledOrder([
    { id: 4, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 1 }
  ]);
  order.id = 42;
  var cancelled = Object.assign({}, order, { id: 43, status: 'cancelled' });
  var result = reports.getGstReconciliation({ orders: [order, cancelled] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].orderId, 42);
  assert.equal(result.rows[0].ledgerTax, 5);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});
