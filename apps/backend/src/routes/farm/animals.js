/**
 * @fileoverview 개체 관리 CRUD API
 * POST   /api/v1/farm/animals       — 개체 등록
 * GET    /api/v1/farm/animals       — 개체 목록 (필터·페이지네이션)
 * GET    /api/v1/farm/animals/:id   — 개체 상세
 * PUT    /api/v1/farm/animals/:id   — 개체 수정
 * DELETE /api/v1/farm/animals/:id   — 개체 삭제 (soft delete)
 * GET    /api/v1/farm/animals/stats — 현황 통계
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

// --- Zod 스키마 ---

const createAnimalSchema = z.object({
  cow_id: z.string().min(1, '이표번호는 필수입니다'),
  name: z.string().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식').optional(),
  breed: z.string().default('Jersey'),
  a2_genotype: z.enum(['A2A2', 'A2A1', 'A1A1']).optional(),
  status: z.enum(['MILKING', 'DRY', 'PREGNANT', 'HEIFER', 'BULL', 'CULL']).default('HEIFER'),
  sex: z.enum(['F', 'M']).default('F'),
  dam_id: z.string().uuid().optional(),
  sire_info: z.string().optional(),
  acquisition_source: z.string().optional(),
  acquisition_cost: z.number().int().min(0).optional(),
  group_tag: z.string().optional(),
  notes: z.string().optional(),
})

const updateAnimalSchema = createAnimalSchema.partial()

const listQuerySchema = z.object({
  status: z.string().optional(),
  group_tag: z.string().optional(),
  a2_genotype: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'cow_id', 'birthdate', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

// --- 라우트 ---

/** GET /stats — 현황 통계 (목록보다 위에 위치해야 :id 충돌 방지) */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE status = 'MILKING' AND deleted_at IS NULL) AS milking,
        COUNT(*) FILTER (WHERE status = 'DRY' AND deleted_at IS NULL) AS dry,
        COUNT(*) FILTER (WHERE status = 'PREGNANT' AND deleted_at IS NULL) AS pregnant,
        COUNT(*) FILTER (WHERE status = 'HEIFER' AND deleted_at IS NULL) AS heifer,
        COUNT(*) FILTER (WHERE status = 'BULL' AND deleted_at IS NULL) AS bull,
        COUNT(*) FILTER (WHERE status = 'CULL' AND deleted_at IS NULL) AS cull,
        COUNT(*) FILTER (WHERE a2_genotype = 'A2A2' AND deleted_at IS NULL) AS a2a2_count
      FROM animals
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST / — 개체 등록 */
router.post('/', validate(createAnimalSchema), async (req, res, next) => {
  try {
    const {
      cow_id, name, birthdate, breed, a2_genotype, status, sex,
      dam_id, sire_info, acquisition_source, acquisition_cost, group_tag, notes,
    } = req.body

    const result = await query(`
      INSERT INTO animals (cow_id, name, birthdate, breed, a2_genotype, status, sex,
        dam_id, sire_info, acquisition_source, acquisition_cost, group_tag, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [cow_id, name, birthdate, breed, a2_genotype, status, sex,
        dam_id, sire_info, acquisition_source, acquisition_cost, group_tag, notes])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json(apiError('DUPLICATE', `이표번호 '${req.body.cow_id}'가 이미 존재합니다`))
    }
    next(err)
  }
})

/** GET / — 개체 목록 */
router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { status, group_tag, a2_genotype, search, page, limit, sort, order } = req.query

    const conditions = ['a.deleted_at IS NULL']
    const params = []
    let paramIdx = 1

    if (status) {
      conditions.push(`a.status = $${paramIdx++}`)
      params.push(status)
    }
    if (group_tag) {
      conditions.push(`a.group_tag = $${paramIdx++}`)
      params.push(group_tag)
    }
    if (a2_genotype) {
      conditions.push(`a.a2_genotype = $${paramIdx++}`)
      params.push(a2_genotype)
    }
    if (search) {
      conditions.push(`(a.cow_id ILIKE $${paramIdx} OR a.name ILIKE $${paramIdx})`)
      params.push(`%${search}%`)
      paramIdx++
    }

    const where = conditions.join(' AND ')
    const offset = (page - 1) * limit

    // 허용된 컬럼만 정렬에 사용 (SQL injection 방지)
    const allowedSort = ['name', 'cow_id', 'birthdate', 'created_at']
    const safeSort = allowedSort.includes(sort) ? sort : 'created_at'
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC'

    const [dataResult, countResult] = await Promise.all([
      query(`
        SELECT a.*, d.name AS dam_name, d.cow_id AS dam_cow_id
        FROM animals a
        LEFT JOIN animals d ON a.dam_id = d.id
        WHERE ${where}
        ORDER BY a.${safeSort} ${safeOrder}
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM animals a WHERE ${where}`, params),
    ])

    const total = parseInt(countResult.rows[0].count, 10)

    res.json(apiResponse(dataResult.rows, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /:id — 개체 상세 */
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT a.*, d.name AS dam_name, d.cow_id AS dam_cow_id
      FROM animals a
      LEFT JOIN animals d ON a.dam_id = d.id
      WHERE a.id = $1 AND a.deleted_at IS NULL
    `, [req.params.id])

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '개체를 찾을 수 없습니다'))
    }

    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** PUT /:id — 개체 수정 */
router.put('/:id', validate(updateAnimalSchema), async (req, res, next) => {
  try {
    const fields = req.body
    // 허용된 컬럼만 업데이트 (SQL 인젝션 방지)
    const allowedColumns = [
      'name', 'cow_id', 'birthdate', 'breed', 'gender', 'status',
      'acquisition_type', 'acquisition_date', 'a2_type', 'dam_id',
      'notes', 'is_donor', 'body_weight', 'body_condition_score',
    ]
    const keys = Object.keys(fields).filter((k) => allowedColumns.includes(k))

    if (keys.length === 0) {
      return res.status(400).json(apiError('NO_FIELDS', '수정할 항목이 없습니다'))
    }

    const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`)
    setClauses.push(`updated_at = NOW()`)
    const values = keys.map((key) => fields[key])

    const result = await query(`
      UPDATE animals SET ${setClauses.join(', ')}
      WHERE id = $${keys.length + 1} AND deleted_at IS NULL
      RETURNING *
    `, [...values, req.params.id])

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '개체를 찾을 수 없습니다'))
    }

    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json(apiError('DUPLICATE', '이표번호가 이미 존재합니다'))
    }
    next(err)
  }
})

/** DELETE /:id — 개체 삭제 (soft delete) */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE animals SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, cow_id, name
    `, [req.params.id])

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '개체를 찾을 수 없습니다'))
    }

    res.json(apiResponse({ message: '개체가 삭제되었습니다', ...result.rows[0] }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
