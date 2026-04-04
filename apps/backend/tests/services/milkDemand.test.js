/**
 * @fileoverview milkDemand 서비스 통합 테스트
 * 원유 수요 계산 로직 검증
 */
const {
  loadProductionSettings,
  calculateRawMilkNeeded,
  generateProductionPlan,
} = require('../../src/services/milkDemand')

describe('loadProductionSettings', () => {
  test('생산 설정 로드 (DB 또는 기본값)', async () => {
    const settings = await loadProductionSettings()

    expect(settings).toHaveProperty('lossRate')
    expect(settings).toHaveProperty('dailyMilking')
    expect(settings).toHaveProperty('rawMilkBom')

    // 기본값 검증
    expect(settings.lossRate).toBeGreaterThanOrEqual(0)
    expect(settings.lossRate).toBeLessThan(1)
    expect(settings.dailyMilking).toBeGreaterThan(0)

    // BOM에 6종 SKU가 있어야 함
    expect(Object.keys(settings.rawMilkBom).length).toBeGreaterThanOrEqual(6)
    // BOM 값은 객체 또는 숫자
    const a2750 = settings.rawMilkBom['A2-750']
    const rawMilkL = typeof a2750 === 'object' ? a2750.raw_milk_l : a2750
    expect(rawMilkL).toBeGreaterThan(0)
  })
})

describe('calculateRawMilkNeeded', () => {
  test('SKU 수량 → 원유 필요량 계산', async () => {
    const result = await calculateRawMilkNeeded({
      'A2-750': 10,
      'A2-180': 20,
    })

    expect(result).toHaveProperty('total_raw_milk_l')
    expect(result).toHaveProperty('breakdown')
    expect(result.total_raw_milk_l).toBeGreaterThan(0)

    // A2-750 10개 = 765ml * 10 = 7.65L 이상
    expect(result.total_raw_milk_l).toBeGreaterThan(7)
  })

  test('빈 수량 입력 시 0L 반환', async () => {
    const result = await calculateRawMilkNeeded({})
    expect(result.total_raw_milk_l).toBe(0)
  })
})

describe('generateProductionPlan', () => {
  test('전체 생산계획 생성', async () => {
    const plan = await generateProductionPlan()

    expect(plan).toHaveProperty('demand_by_channel')
    expect(plan).toHaveProperty('demand_by_sku')
    expect(plan).toHaveProperty('raw_milk')
    expect(plan).toHaveProperty('milk_allocation')
    expect(plan).toHaveProperty('farm_capacity')
    expect(plan).toHaveProperty('summary')

    // 우유 배분 구조 검증 (daily_to_factory_l 또는 daily_to_factory)
    const alloc = plan.milk_allocation
    const factoryKey = 'daily_to_factory_l' in alloc ? 'daily_to_factory_l' : 'daily_to_factory'
    const dairyKey = 'daily_to_dairy_l' in alloc ? 'daily_to_dairy_l' : 'daily_to_dairy'
    expect(alloc).toHaveProperty(factoryKey)
    expect(alloc).toHaveProperty(dairyKey)

    // 총 착유량 = 공장 + 진흥회
    const factory = parseFloat(alloc[factoryKey])
    const dairy = parseFloat(alloc[dairyKey])
    const totalMilking = alloc.daily_milking_l || plan.farm_capacity?.daily_milking_l || 550
    expect(factory + dairy).toBeCloseTo(totalMilking, 0)
  })
})
