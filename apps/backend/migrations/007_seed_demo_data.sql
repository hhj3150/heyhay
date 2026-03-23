-- ============================================================
-- 007: 데모 시드 데이터
-- 고객 30명 + 주문 50건 + 구독 15건 + 개체 10두 + 착유 + 공장
-- docker compose up 후 자동 실행
-- ============================================================

-- ============================================================
-- 추가 사용자 계정
-- ============================================================
INSERT INTO users (username, password_hash, name, role, phone) VALUES
  ('factory01', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOoEJVoLFJ0BqF5RQo2B8xXE7H1Qa8GHy', '김공장', 'FACTORY', '010-1234-0001'),
  ('cafe01', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOoEJVoLFJ0BqF5RQo2B8xXE7H1Qa8GHy', '이카페', 'CAFE', '010-1234-0002'),
  ('farm01', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOoEJVoLFJ0BqF5RQo2B8xXE7H1Qa8GHy', '박목장', 'FARM', '010-1234-0003')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 목장 개체 10두 (저지종 A2A2)
-- ============================================================
INSERT INTO animals (cow_id, name, birthdate, breed, a2_genotype, status, sex) VALUES
  ('002-1001', '별이',   '2020-03-15', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1002', '달이',   '2019-11-20', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1003', '하늘이', '2021-01-10', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1004', '초롱이', '2020-07-05', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1005', '봄이',   '2021-06-22', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1006', '여름이', '2020-09-11', 'Jersey', 'A2A2', 'DRY', 'F'),
  ('002-1007', '가을이', '2019-04-30', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1008', '겨울이', '2022-02-14', 'Jersey', 'A2A2', 'PREGNANT', 'F'),
  ('002-1009', '구름이', '2021-08-19', 'Jersey', 'A2A2', 'MILKING', 'F'),
  ('002-1010', '바람이', '2022-05-03', 'Jersey', 'A2A1', 'HEIFER', 'F')
ON CONFLICT (cow_id) DO NOTHING;

-- ============================================================
-- 고객 30명 (실감나는 한국 이름)
-- ============================================================
INSERT INTO customers (name, phone, email, channel, segment, address_zip, address_main, address_detail, marketing_sms, total_orders, total_spent, ltv, first_order_at, last_order_at) VALUES
  ('김서연', '010-2345-1001', 'kim.sy@email.com', 'OWN_MALL', 'VIP', '17514', '경기도 안성시 공도읍 대신두길 12', '101동 302호', true, 24, 384000, 420000, '2025-06-10', '2026-03-20'),
  ('이준호', '010-2345-1002', 'lee.jh@email.com', 'SMARTSTORE', 'ACTIVE', '06134', '서울 강남구 테헤란로 217', '5층', true, 12, 192000, 210000, '2025-09-15', '2026-03-18'),
  ('박민지', '010-2345-1003', 'park.mj@email.com', 'OWN_MALL', 'VIP', '13494', '경기도 성남시 분당구 판교역로 235', '1004호', true, 36, 576000, 630000, '2025-03-01', '2026-03-21'),
  ('정우진', '010-2345-1004', 'jung.wj@email.com', 'SMARTSTORE', 'ACTIVE', '04523', '서울 중구 세종대로 110', '본관 2층', false, 8, 128000, 140000, '2025-11-20', '2026-03-15'),
  ('최수아', '010-2345-1005', 'choi.sa@email.com', 'OWN_MALL', 'ACTIVE', '34015', '대전 유성구 대학로 99', 'A동 501호', true, 15, 240000, 260000, '2025-07-08', '2026-03-19'),
  ('강도현', '010-2345-1006', 'kang.dh@email.com', 'SMARTSTORE', 'ACTIVE', '48058', '부산 해운대구 센텀중앙로 48', '1201호', true, 10, 160000, 175000, '2025-10-03', '2026-03-17'),
  ('윤서영', '010-2345-1007', 'yoon.sy@email.com', 'OWN_MALL', 'VIP', '17515', '경기도 안성시 당목길 15', '2층', true, 30, 480000, 530000, '2025-04-12', '2026-03-22'),
  ('임태민', '010-2345-1008', 'lim.tm@email.com', 'SMARTSTORE', 'ACTIVE', '14066', '경기도 안양시 동안구 시민대로 230', '301호', false, 6, 96000, 105000, '2025-12-01', '2026-03-10'),
  ('한지은', '010-2345-1009', 'han.je@email.com', 'OWN_MALL', 'ACTIVE', '63082', '제주 제주시 연동 286-6', '3층', true, 9, 144000, 158000, '2025-10-20', '2026-03-16'),
  ('송민석', '010-2345-1010', 'song.ms@email.com', 'B2B', 'VIP', '17520', '경기도 안성시 팜랜드로 300', '사무동', true, 48, 2400000, 2650000, '2025-01-15', '2026-03-22'),
  ('오하린', '010-2345-1011', 'oh.hr@email.com', 'SMARTSTORE', 'ACTIVE', '16610', '경기도 수원시 장안구 정조로 898', '204호', true, 7, 112000, 123000, '2025-11-05', '2026-03-14'),
  ('배서준', '010-2345-1012', 'bae.sj@email.com', 'OWN_MALL', 'ACTIVE', '03981', '서울 마포구 월드컵북로 396', '1003호', false, 11, 176000, 193000, '2025-08-22', '2026-03-20'),
  ('조예린', '010-2345-1013', 'cho.yr@email.com', 'SMARTSTORE', 'DORMANT', '35204', '대전 서구 둔산로 100', '801호', true, 4, 64000, 70000, '2026-01-10', '2026-02-28'),
  ('신동윤', '010-2345-1014', 'shin.dy@email.com', 'OWN_MALL', 'DORMANT', '61452', '울산 남구 삼산로 278', '502호', false, 3, 48000, 52000, '2025-12-15', '2026-01-20'),
  ('황수현', '010-2345-1015', 'hwang.sh@email.com', 'SMARTSTORE', 'ACTIVE', '21945', '인천 연수구 송도과학로 32', '404호', true, 14, 224000, 245000, '2025-06-30', '2026-03-19'),
  ('노현우', '010-2345-1016', 'noh.hw@email.com', 'OWN_MALL', 'ACTIVE', '42011', '대구 수성구 알파시티1로 168', '1505호', true, 8, 128000, 140000, '2025-09-28', '2026-03-17'),
  ('문지아', '010-2345-1017', 'moon.ja@email.com', 'SMARTSTORE', 'NEW', '54843', '전북 전주시 덕진구 백제대로 567', '103호', false, 1, 16000, 16000, '2026-03-18', '2026-03-18'),
  ('양재원', '010-2345-1018', 'yang.jw@email.com', 'B2B', 'ACTIVE', '17530', '경기도 안성시 비봉면 삼죽로 230', '본점', true, 20, 1000000, 1100000, '2025-05-20', '2026-03-21'),
  ('권유나', '010-2345-1019', 'kwon.yn@email.com', 'OWN_MALL', 'ACTIVE', '12345', '경기도 고양시 일산동구 중앙로 1261', '702호', true, 13, 208000, 228000, '2025-07-15', '2026-03-20'),
  ('유승리', '010-2345-1020', 'yoo.sr@email.com', 'SMARTSTORE', 'CHURNED', '04527', '서울 중구 남대문로 52', '3층', false, 2, 32000, 35000, '2025-11-10', '2025-12-20'),
  ('장하율', '010-2345-1021', 'jang.hy@email.com', 'OWN_MALL', 'ACTIVE', '17516', '경기도 안성시 죽산면 서산로 78', '1층', true, 16, 256000, 280000, '2025-05-05', '2026-03-21'),
  ('류시원', '010-2345-1022', 'ryu.sw@email.com', 'SMARTSTORE', 'ACTIVE', '31116', '충남 천안시 서북구 백석로 132', '501호', false, 5, 80000, 88000, '2026-01-08', '2026-03-12'),
  ('안소율', '010-2345-1023', 'ahn.sy@email.com', 'OWN_MALL', 'ACTIVE', '16250', '경기도 수원시 팔달구 효원로 1', '402호', true, 10, 160000, 175000, '2025-08-14', '2026-03-18'),
  ('서건우', '010-2345-1024', 'seo.gw@email.com', 'SMARTSTORE', 'ACTIVE', '41939', '대구 중구 국채보상로 512', '208호', true, 7, 112000, 123000, '2025-10-25', '2026-03-15'),
  ('홍지윤', '010-2345-1025', 'hong.jy@email.com', 'OWN_MALL', 'VIP', '17518', '경기도 안성시 금산길 25', '1층', true, 28, 448000, 490000, '2025-04-20', '2026-03-22'),
  ('남도훈', '010-2345-1026', 'nam.dh@email.com', 'B2B', 'ACTIVE', '17522', '경기도 안성시 원곡면 제3산업로 22', '사무실', true, 15, 750000, 825000, '2025-06-01', '2026-03-20'),
  ('고은채', '010-2345-1027', 'go.ec@email.com', 'SMARTSTORE', 'NEW', '02878', '서울 성북구 보문로 168', '901호', false, 1, 16000, 16000, '2026-03-20', '2026-03-20'),
  ('백준서', '010-2345-1028', 'baek.js@email.com', 'OWN_MALL', 'ACTIVE', '13544', '경기도 성남시 분당구 돌마로 46', '1001호', true, 9, 144000, 158000, '2025-09-08', '2026-03-19'),
  ('탁하윤', '010-2345-1029', 'tak.hy@email.com', 'SMARTSTORE', 'ACTIVE', '44677', '울산 중구 학성로 66', '307호', true, 6, 96000, 105000, '2025-12-22', '2026-03-13'),
  ('진소민', '010-2345-1030', 'jin.sm@email.com', 'OWN_MALL', 'ACTIVE', '51728', '경남 창원시 성산구 창원대로 735', '603호', false, 11, 176000, 193000, '2025-08-01', '2026-03-21')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 정기구독 15건 (활성 10, 일시정지 3, 해지 2)
-- ============================================================
INSERT INTO subscriptions (customer_id, plan_name, frequency, duration_months, items, price_per_cycle, payment_method, started_at, next_payment_at, status, cohort_month) VALUES
  -- 활성 구독 10건
  ((SELECT id FROM customers WHERE phone='010-2345-1001'), 'A2 우유 정기배송', '1W', 6,
   '[{"sku_code":"A2-750","quantity":2},{"sku_code":"YG-180","quantity":4}]', 28000, '카드자동결제', '2025-12-01', '2026-03-24', 'ACTIVE', '2025-12-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1003'), '프리미엄 A2 패밀리', '1W', 12,
   '[{"sku_code":"A2-750","quantity":3},{"sku_code":"A2-180","quantity":6}]', 42000, '카드자동결제', '2025-06-01', '2026-03-25', 'ACTIVE', '2025-06-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1005'), 'A2 우유 기본', '2W', 3,
   '[{"sku_code":"A2-750","quantity":1},{"sku_code":"YG-500","quantity":2}]', 22000, '카드자동결제', '2026-01-15', '2026-03-26', 'ACTIVE', '2026-01-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1007'), 'VIP 전품목', '1W', NULL,
   '[{"sku_code":"A2-750","quantity":2},{"sku_code":"YG-500","quantity":2},{"sku_code":"KM-100","quantity":1}]', 52000, '카드자동결제', '2025-08-01', '2026-03-23', 'ACTIVE', '2025-08-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1015'), '발효유 정기배송', '2W', 6,
   '[{"sku_code":"YG-500","quantity":3},{"sku_code":"YG-180","quantity":6}]', 35000, '카드자동결제', '2025-10-01', '2026-03-28', 'ACTIVE', '2025-10-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1019'), 'A2 우유 기본', '1W', 3,
   '[{"sku_code":"A2-750","quantity":2}]', 18000, '카드자동결제', '2026-02-01', '2026-03-24', 'ACTIVE', '2026-02-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1021'), '안성 직배송 세트', '1W', 6,
   '[{"sku_code":"A2-750","quantity":1},{"sku_code":"A2-180","quantity":4},{"sku_code":"KM-100","quantity":1}]', 32000, '카드자동결제', '2025-09-01', '2026-03-25', 'ACTIVE', '2025-09-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1025'), '프리미엄 A2 패밀리', '1W', NULL,
   '[{"sku_code":"A2-750","quantity":3},{"sku_code":"YG-500","quantity":1},{"sku_code":"A2-180","quantity":4}]', 45000, '카드자동결제', '2025-07-01', '2026-03-23', 'ACTIVE', '2025-07-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1028'), '발효유 기본', '2W', 3,
   '[{"sku_code":"YG-500","quantity":2}]', 14000, '카드자동결제', '2026-01-20', '2026-03-27', 'ACTIVE', '2026-01-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1030'), 'A2 우유 기본', '4W', 6,
   '[{"sku_code":"A2-750","quantity":4}]', 32000, '카드자동결제', '2025-11-01', '2026-04-02', 'ACTIVE', '2025-11-01'),
  -- 일시정지 3건
  ((SELECT id FROM customers WHERE phone='010-2345-1002'), 'A2 우유 기본', '2W', 3,
   '[{"sku_code":"A2-750","quantity":2}]', 18000, '카드자동결제', '2025-12-15', NULL, 'PAUSED', '2025-12-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1013'), '발효유 기본', '2W', 3,
   '[{"sku_code":"YG-500","quantity":1},{"sku_code":"YG-180","quantity":2}]', 15000, '카드자동결제', '2026-01-10', NULL, 'PAUSED', '2026-01-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1008'), 'A2 우유 기본', '4W', 3,
   '[{"sku_code":"A2-750","quantity":1}]', 9000, '카드자동결제', '2026-01-01', NULL, 'PAUSED', '2026-01-01'),
  -- 해지 2건
  ((SELECT id FROM customers WHERE phone='010-2345-1014'), 'A2 우유 기본', '4W', 3,
   '[{"sku_code":"A2-750","quantity":1}]', 9000, '카드자동결제', '2025-12-15', NULL, 'CANCELLED', '2025-12-01'),
  ((SELECT id FROM customers WHERE phone='010-2345-1020'), '발효유 기본', '2W', 1,
   '[{"sku_code":"YG-180","quantity":4}]', 12000, '카드자동결제', '2025-11-10', NULL, 'CANCELLED', '2025-11-01')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 주문 50건 (다양한 상태)
-- ============================================================
DO $$
DECLARE
  v_sku_a2_750 UUID;
  v_sku_a2_180 UUID;
  v_sku_yg_500 UUID;
  v_sku_yg_180 UUID;
  v_sku_km_100 UUID;
  v_cust RECORD;
  v_order_id UUID;
  v_order_num TEXT;
  v_idx INT := 1;
  v_subtotal INT;
  v_total INT;
  v_created TIMESTAMPTZ;
  v_date_str TEXT;
  v_statuses TEXT[] := ARRAY['PENDING','PAID','PROCESSING','PACKED','SHIPPED','DELIVERED','DELIVERED','DELIVERED'];
  v_couriers TEXT[] := ARRAY['CJ대한통운','롯데택배','한진택배','우체국','로젠택배'];
BEGIN
  SELECT id INTO v_sku_a2_750 FROM skus WHERE code = 'A2-750';
  SELECT id INTO v_sku_a2_180 FROM skus WHERE code = 'A2-180';
  SELECT id INTO v_sku_yg_500 FROM skus WHERE code = 'YG-500';
  SELECT id INTO v_sku_yg_180 FROM skus WHERE code = 'YG-180';
  SELECT id INTO v_sku_km_100 FROM skus WHERE code = 'KM-100';

  FOR v_cust IN (
    SELECT id, name, phone, channel, address_zip, address_main, address_detail
    FROM customers WHERE deleted_at IS NULL
    ORDER BY created_at LIMIT 30
  )
  LOOP
    -- 각 고객당 1~3건 주문
    FOR i IN 1..LEAST(3, GREATEST(1, (v_idx % 3) + 1))
    LOOP
      -- 주문 생성 시점 계산
      v_created := NOW() - ((50 - v_idx) || ' hours')::INTERVAL;
      v_date_str := TO_CHAR(v_created, 'YYYYMMDD');
      v_order_num := 'HH-' || v_date_str || '-' || LPAD(v_idx::TEXT, 4, '0');

      -- 아이템 기반 금액 계산: 짝수 idx → 2종(A2-750 + YG-180×2), 홀수 → 1종(A2-750)
      IF v_idx % 2 = 0 THEN
        v_subtotal := 9000 + 7000;  -- A2-750 ×1 + YG-180 ×2
      ELSE
        v_subtotal := 9000;          -- A2-750 ×1
      END IF;
      v_total := v_subtotal + 3000;  -- + shipping_fee

      INSERT INTO orders (
        order_number, customer_id, channel, status,
        subtotal, shipping_fee, discount, total_amount,
        recipient_name, recipient_phone, shipping_zip, shipping_address,
        shipping_memo, ice_pack_count,
        courier, tracking_number,
        created_at, paid_at, shipped_at, delivered_at
      ) VALUES (
        v_order_num,
        v_cust.id,
        CASE WHEN v_cust.channel = 'CAFE' THEN 'OWN_MALL' ELSE v_cust.channel END,
        v_statuses[1 + (v_idx % 8)],
        v_subtotal, 3000, 0, v_total,
        v_cust.name,
        v_cust.phone,
        v_cust.address_zip,
        v_cust.address_main || ' ' || COALESCE(v_cust.address_detail, ''),
        CASE v_idx % 5
          WHEN 0 THEN '부재시 경비실에 맡겨주세요'
          WHEN 1 THEN '아이스팩 추가 부탁드립니다'
          WHEN 2 THEN '벨 누르지 마세요'
          WHEN 3 THEN '문 앞에 놓아주세요'
          ELSE NULL
        END,
        CASE WHEN v_idx % 3 = 0 THEN 2 ELSE 1 END,
        CASE WHEN v_statuses[1 + (v_idx % 8)] IN ('SHIPPED','DELIVERED') THEN v_couriers[1 + (v_idx % 5)] ELSE NULL END,
        CASE WHEN v_statuses[1 + (v_idx % 8)] IN ('SHIPPED','DELIVERED') THEN '6000' || LPAD(v_idx::TEXT, 8, '0') ELSE NULL END,
        v_created,
        CASE WHEN v_statuses[1 + (v_idx % 8)] NOT IN ('PENDING') THEN v_created + INTERVAL '1 hour' ELSE NULL END,
        CASE WHEN v_statuses[1 + (v_idx % 8)] IN ('SHIPPED','DELIVERED') THEN v_created + INTERVAL '10 hours' ELSE NULL END,
        CASE WHEN v_statuses[1 + (v_idx % 8)] = 'DELIVERED' THEN v_created + INTERVAL '20 hours' ELSE NULL END
      )
      RETURNING id INTO v_order_id;

      -- 주문 아이템
      INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal) VALUES
        (v_order_id, v_sku_a2_750, 1, 9000, 9000);

      IF v_idx % 2 = 0 THEN
        INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal) VALUES
          (v_order_id, v_sku_yg_180, 2, 3500, 7000);
      END IF;

      v_idx := v_idx + 1;
      EXIT WHEN v_idx > 50;
    END LOOP;
    EXIT WHEN v_idx > 50;
  END LOOP;
END $$;

-- ============================================================
-- 알림 데모 (P1~P3)
-- ============================================================
INSERT INTO alerts (module, priority, alert_type, title, message, target_roles) VALUES
  ('farm', 'P1', 'MILK_DROP', '착유량 급감 경고', '별이(002-1001) 착유량이 어제 대비 -32% 감소했습니다. 건강 확인이 필요합니다.', '["ADMIN","FARM"]'),
  ('factory', 'P1', 'CCP_DEVIATION', 'CCP1 온도 이탈', '배치 20260322-A2-001: 살균 온도 70.5°C → 기준 72°C 미달. 즉시 확인 필요.', '["ADMIN","FACTORY"]'),
  ('market', 'P2', 'LOW_STOCK', '재고 안전선 도달', 'A2 저지우유 750ml 재고 12개 → 안전선(20개) 이하. 생산 계획 확인.', '["ADMIN","FACTORY"]'),
  ('market', 'P2', 'PAYMENT_FAILED', '결제 실패 2건', '김서연, 이준호 고객 정기구독 결제 실패. 24시간 내 재시도 예정.', '["ADMIN"]'),
  ('farm', 'P3', 'CALVING_DUE', '분만 예정 D-5', '겨울이(002-1008) 분만 예정일 2026-03-27. 분만실 준비 필요.', '["ADMIN","FARM"]'),
  ('factory', 'P3', 'CERT_EXPIRY', '경기도청 인증 갱신 D-25', 'HACCP 인증 만료 2026-04-16. 갱신 서류 준비 필요.', '["ADMIN","FACTORY"]')
ON CONFLICT DO NOTHING;
