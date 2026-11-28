import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPageNumbers, computePaginationState } from '../hooks/usePagination.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '..')

const makeRecords = (count) =>
  Array.from({ length: count }, (_, idx) => ({
    id: `rec_${idx + 1}`,
    name: `Record ${idx + 1}`
  }))

test('Pagination System & Purchase Bills Column Removal Tests', async (t) => {
  await t.test('1. Multi-page slicing covers 56 records cleanly without duplicates or gaps', () => {
    const records = makeRecords(56)

    const page1 = computePaginationState({ items: records, requestedPage: 1, pageSize: 20 })
    assert.equal(page1.currentPage, 1)
    assert.equal(page1.totalPages, 3)
    assert.equal(page1.totalItems, 56)
    assert.equal(page1.startItem, 1)
    assert.equal(page1.endItem, 20)
    assert.equal(page1.isFirstPage, true)
    assert.equal(page1.isLastPage, false)
    assert.equal(page1.paginatedItems.length, 20)
    assert.equal(page1.paginatedItems[0].id, 'rec_1')
    assert.equal(page1.paginatedItems[19].id, 'rec_20')

    const page2 = computePaginationState({ items: records, requestedPage: 2, pageSize: 20 })
    assert.equal(page2.currentPage, 2)
    assert.equal(page2.startItem, 21)
    assert.equal(page2.endItem, 40)
    assert.equal(page2.isFirstPage, false)
    assert.equal(page2.isLastPage, false)
    assert.equal(page2.paginatedItems.length, 20)
    assert.equal(page2.paginatedItems[0].id, 'rec_21')
    assert.equal(page2.paginatedItems[19].id, 'rec_40')

    const page3 = computePaginationState({ items: records, requestedPage: 3, pageSize: 20 })
    assert.equal(page3.currentPage, 3)
    assert.equal(page3.startItem, 41)
    assert.equal(page3.endItem, 56)
    assert.equal(page3.isFirstPage, false)
    assert.equal(page3.isLastPage, true)
    assert.equal(page3.paginatedItems.length, 16)
    assert.equal(page3.paginatedItems[0].id, 'rec_41')
    assert.equal(page3.paginatedItems[15].id, 'rec_56')

    const combined = [
      ...page1.paginatedItems,
      ...page2.paginatedItems,
      ...page3.paginatedItems
    ]
    assert.equal(combined.length, 56)
    assert.deepEqual(combined.map(r => r.id), records.map(r => r.id))
  })

  await t.test('2. Changing records-per-page (10, 20, 50, 100) recomputes pages without skipped/duplicate items', () => {
    const records = makeRecords(56)

    for (const pageSize of [10, 20, 50, 100]) {
      const expectedPages = Math.ceil(56 / pageSize)
      const collected = []
      for (let p = 1; p <= expectedPages; p++) {
        const state = computePaginationState({ items: records, requestedPage: p, pageSize })
        assert.equal(state.totalPages, expectedPages)
        assert.equal(state.currentPage, p)
        assert.equal(state.isFirstPage, p === 1)
        assert.equal(state.isLastPage, p === expectedPages)
        collected.push(...state.paginatedItems)
      }
      assert.equal(collected.length, 56)
      assert.deepEqual(collected.map(r => r.id), records.map(r => r.id))
    }
  })

  await t.test('3. Handles empty items, invalid pages, and out-of-range clamping', () => {
    const empty = computePaginationState({ items: [], requestedPage: 3, pageSize: 20 })
    assert.equal(empty.totalItems, 0)
    assert.equal(empty.totalPages, 1)
    assert.equal(empty.currentPage, 1)
    assert.equal(empty.startItem, 0)
    assert.equal(empty.endItem, 0)
    assert.equal(empty.isFirstPage, true)
    assert.equal(empty.isLastPage, true)
    assert.deepEqual(empty.paginatedItems, [])

    const records = makeRecords(25)
    const clampedHigh = computePaginationState({ items: records, requestedPage: 99, pageSize: 20 })
    assert.equal(clampedHigh.currentPage, 2)
    assert.equal(clampedHigh.startItem, 21)
    assert.equal(clampedHigh.endItem, 25)
    assert.equal(clampedHigh.isLastPage, true)

    const clampedInvalid = computePaginationState({ items: records, requestedPage: 'abc', pageSize: 20 })
    assert.equal(clampedInvalid.currentPage, 1)
    assert.equal(clampedInvalid.isFirstPage, true)
  })

  await t.test('4. buildPageNumbers produces condensed sequences without bogus adjacent ellipses', () => {
    assert.deepEqual(buildPageNumbers(5, 1), [1, 2, 3, 4, 5])
    assert.deepEqual(buildPageNumbers(8, 1), [1, 2, 3, 4, '...', 7, 8])
    assert.deepEqual(buildPageNumbers(8, 4), [1, 2, 3, 4, 5, 6, 7, 8])
    assert.deepEqual(buildPageNumbers(12, 6), [1, 2, '...', 5, 6, 7, '...', 11, 12])
    assert.deepEqual(buildPageNumbers(12, 11), [1, 2, '...', 9, 10, 11, 12])
  })

  await t.test('5. usePagination and Pagination share matching handler props for {...pagination}', () => {
    const hookSrc = fs.readFileSync(path.join(srcDir, 'hooks', 'usePagination.js'), 'utf8')
    const compSrc = fs.readFileSync(path.join(srcDir, 'components', 'ui', 'Pagination.jsx'), 'utf8')

    for (const propName of [
      'onPageChange',
      'onNextPage',
      'onPrevPage',
      'onFirstPage',
      'onLastPage',
      'onPageSizeChange'
    ]) {
      assert.match(hookSrc, new RegExp(`\\b${propName}:`), `usePagination must expose ${propName}`)
      assert.match(compSrc, new RegExp(`\\b${propName}\\b`), `Pagination.jsx must accept ${propName}`)
    }
  })

  await t.test('6. PurchaseBills table removes Outstanding column while other record pages keep Pagination', () => {
    const billsSrc = fs.readFileSync(path.join(srcDir, 'pages', 'PurchaseBills.jsx'), 'utf8')
    const tableSection = billsSrc.slice(
      billsSrc.indexOf('{/* Table Card */}'),
      billsSrc.indexOf('{/* Bill Add / Edit / Preview Modal */}')
    )

    assert.equal(
      /Outstanding/i.test(tableSection),
      false,
      'PurchaseBills table and mobile list cards must not render Outstanding column'
    )

    const paginatedPages = [
      'PurchaseBills.jsx',
      'Vendors.jsx',
      'VendorPayments.jsx',
      'Financiers.jsx',
      'FinancierProfile.jsx',
      'Loans.jsx',
      'FinancierPayments.jsx',
      'ChequeRegistry.jsx',
      'OutstandingStatement.jsx',
      'RunningLedger.jsx',
      'TransactionHistory.jsx'
    ]

    for (const pageFile of paginatedPages) {
      const pageSrc = fs.readFileSync(path.join(srcDir, 'pages', pageFile), 'utf8')
      assert.match(pageSrc, /usePagination\s*\(/, `${pageFile} must invoke usePagination`)
      assert.match(pageSrc, /<Pagination\b/, `${pageFile} must render Pagination component`)
      assert.match(pageSrc, /pagination\.paginatedItems\.map/, `${pageFile} must slice using pagination.paginatedItems`)
    }
  })
})
