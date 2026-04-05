/**
 * @fileoverview 원가 분석 API
 * GET /api/v1/factory/cost-analysis/summary   — 기간별 원가 요약
 * GET /api/v1/factory/cost-analysis/by-sku    — SKU별 원가·수익 분석
 * GET /api/v1/factory/cost-analysis/trend     — 월별 원가 추이
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse } = require('../../lib/shared')

const router = express.Router()

/** GET /summary — 기간별 원가 요약 (이번달 기준) */
router.get('/summary', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query

    // 기간 필터 SQL
    const periodFilter = period === 'month'
      ? "produced_at >= DATE_TRUNC('month', CURRENT_DATE)"
      : period === 'week'
        ? "produced_at >= CURRENT_DATE - INTERVAL '7 days'"
        : "produced_at >= CURRENT_DATE - INTERVAL '30 days'"

    const result = await query(`
      SELECT
        COUNT(*) AS batch_count,
        COALESCE(SUM(quantity), 0) AS total_qty,
        COALESCE(SUM(raw_milk_used_l), 0) AS total_raw_milk_l,
        COALESCE(SUM(material_cost), 0) AS total_material_cost,
        COALESCE(SUM(labor_cost), 0) AS total_labor_cost,
        COALESCE(SUM(overhead_cost), 0) AS total_overhead_cost,
        COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) AS total_cost,
        AVG(unit_cost) AS avg_unit_cost
      FROM production_batches
      WHERE ${periodFilter}
        AND deleted_at IS NULL
    `)

    const row = result.rows[0]
    res.json(apiResponse({
      period,
      batch_count: parseInt(row.batch_count, 10),
      total_qty: parseInt(row.total_qty, 10),
      total_raw_milk_l: parseFloat(row.total_raw_milk_l),
      total_material_cost: parseInt(row.total_material_cost, 10),
      total_labor_cost: parseInt(row.total_labor_cost, 10),
      total_overhead_cost: parseInt(row.total_overhead_cost, 10),
      total_cost: parseInt(row.total_cost, 10),
      avg_unit_cost: row.avg_unit_cost ? Math.round(parseFloat(row.avg_unit_cost)) : 0,
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /by-sku — SKU별 원가·수익 분석 */
router.get('/by-sku', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query
    const periodFilter = period === 'month'
      ? "pb.produced_at >= DATE_TRUNC('month', CURRENT_DATE)"
      : period === 'week'
        ? "pb.produced_at >= CURRENT_DATE - INTERVAL '7 days'"
        : "pb.produced_at >= CURRENT_DATE - INTERVAL '30 days'"

    // SKU별 원가 집계 + RETAIL 단가 조회하여 마진율 계산
    const result = await query(`
      SELECT
        s.id AS sku_id,
        s.code,
        s.name,
        COUNT(pb.id) AS batch_count,
        COALESCE(SUM(pb.quantity), 0) AS total_qty,
        COALESCE(SUM(pb.raw_milk_used_l), 0) AS total_raw_milk_l,
        COALESCE(SUM(pb.material_cost + pb.labor_cost + pb.overhead_cost), 0) AS total_cost,
        COALESCE(AVG(pb.unit_cost), 0) AS avg_unit_cost,
        (SELECT unit_price FROM sku_prices
          WHERE sku_code = s.code AND channel = 'RETAIL' AND effective_to IS NULL
          LIMIT 1) AS retail_price
      FROM skus s
      LEFT JOIN production_batches pb ON s.id = pb.sku_id
        AND ${periodFilter}
        AND pb.deleted_at IS NULL
      WHERE s.is_active = true
      GROUP BY s.id, s.code, s.name
      ORDER BY s.code
    `)

    const rows = result.rows.map((r) => {
      const avgCost = Math.round(parseFloat(r.avg_unit_cost) || 0)
      const retail = r.retail_price ? parseInt(r.retail_price, 10) : 0
      const margin = retail > 0 && avgCost > 0 ? retail - avgCost : null
      const marginPct = retail > 0 && avgCost > 0 ? ((retail - avgCost) / retail * 100).toFixed(1) : null

      return {
        sku_id: r.sku_id,
        code: r.code,
        name: r.name,
        batch_count: parseInt(r.batch_count, 10),
        total_qty: parseInt(r.total_qty, 10),
        total_raw_milk_l: parseFloat(r.total_raw_milk_l),
        total_cost: parseInt(r.total_cost, 10),
        avg_unit_cost: avgCost,
        retail_price: retail,
        margin,
        margin_pct: marginPct,
      }
    })

    res.json(apiResponse(rows))
  } catch (err) {
    next(err)
  }
})

/** GET /trend — 월별 원가 추이 (최근 6개월) */
router.get('/trend', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', produced_at), 'YYYY-MM') AS month,
        COUNT(*) AS batch_count,
        COALESCE(SUM(quantity), 0) AS total_qty,
        COALESCE(SUM(material_cost + labor_cost + overhead_cost), 0) AS total_cost,
        COALESCE(AVG(unit_cost), 0) AS avg_unit_cost
      FROM production_batches
      WHERE produced_at >= CURRENT_DATE - INTERVAL '6 months'
        AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', produced_at)
      ORDER BY month ASC
    `)

    res.json(apiResponse(result.rows.map((r) => ({
      month: r.month,
      batch_count: parseInt(r.batch_count, 10),
      total_qty: parseInt(r.total_qty, 10),
      total_cost: parseInt(r.total_cost, 10),
      avg_unit_cost: Math.round(parseFloat(r.avg_unit_cost) || 0),
    }))))
  } catch (err) {
    next(err)
  }
})

module.exports = router
