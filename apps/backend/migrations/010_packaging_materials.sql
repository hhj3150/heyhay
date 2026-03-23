-- ============================================================
-- 010: 포장 자재 관리 시스템
-- 자재 마스터 + 입출고 이력 + 발주 관리
-- ============================================================

-- packaging_materials (포장 자재 마스터)
CREATE TABLE packaging_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(20) NOT NULL CHECK (category IN ('PET_BOTTLE','CUP','LID','CAP','LABEL','BOX','ICE_PACK','TAPE','OTHER')),
  name VARCHAR(100) NOT NULL,
  spec VARCHAR(200),
  sku_mapping TEXT[],
  unit VARCHAR(20) DEFAULT '개',
  unit_cost INTEGER DEFAULT 0,
  safety_stock INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  lead_days INTEGER DEFAULT 3,
  supplier_name VARCHAR(200),
  supplier_contact VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- packaging_stock_logs (입출고 이력)
CREATE TABLE packaging_stock_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID NOT NULL REFERENCES packaging_materials(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('IN','OUT','ADJUST')),
  quantity INTEGER NOT NULL,
  reason VARCHAR(200),
  reference_id VARCHAR(100),
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_logs_material ON packaging_stock_logs(material_id, created_at DESC);

-- packaging_orders (발주 관리)
CREATE TABLE packaging_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID NOT NULL REFERENCES packaging_materials(id),
  order_qty INTEGER NOT NULL,
  unit_cost INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ORDERED','SHIPPED','RECEIVED','CANCELLED')),
  ordered_at TIMESTAMPTZ,
  expected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_qty INTEGER,
  supplier_name VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 시드 데이터: 18종 자재 (unit_cost 모두 0)
-- ============================================================

-- 페트병 4종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('PET_BOTTLE', 'PET병 750ml (A2)', '투명 PET, 750ml', ARRAY['A2-750'], '개', 500),
('PET_BOTTLE', 'PET병 180ml (A2)', '투명 PET, 180ml', ARRAY['A2-180'], '개', 1000),
('PET_BOTTLE', 'PET병 500ml (발효유)', '투명 PET, 500ml', ARRAY['YG-500'], '개', 500),
('PET_BOTTLE', 'PET병 180ml (발효유)', '투명 PET, 180ml', ARRAY['YG-180'], '개', 1000);

-- 캡 4종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('CAP', '캡 750ml (A2)', 'PP 스크류캡, 흰색', ARRAY['A2-750'], '개', 500),
('CAP', '캡 180ml (A2)', 'PP 스크류캡, 흰색', ARRAY['A2-180'], '개', 1000),
('CAP', '캡 500ml (발효유)', 'PP 스크류캡, 흰색', ARRAY['YG-500'], '개', 500),
('CAP', '캡 180ml (발효유)', 'PP 스크류캡, 흰색', ARRAY['YG-180'], '개', 1000);

-- 라벨 4종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('LABEL', '라벨 750ml (A2)', 'OPP 수축라벨', ARRAY['A2-750'], '개', 500),
('LABEL', '라벨 180ml (A2)', 'OPP 수축라벨', ARRAY['A2-180'], '개', 1000),
('LABEL', '라벨 500ml (발효유)', 'OPP 수축라벨', ARRAY['YG-500'], '개', 500),
('LABEL', '라벨 180ml (발효유)', 'OPP 수축라벨', ARRAY['YG-180'], '개', 1000);

-- 박스 3종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('BOX', '택배박스 소', '180ml 6입용', ARRAY['A2-180','YG-180'], '개', 300),
('BOX', '택배박스 중', '750ml 2입 / 500ml 3입용', ARRAY['A2-750','YG-500'], '개', 200),
('BOX', '택배박스 대', '혼합 대량배송용', ARRAY['A2-750','A2-180','YG-500','YG-180'], '개', 100);

-- 아이스팩 2종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('ICE_PACK', '아이스팩 350g', '소형 택배용', ARRAY['A2-180','YG-180'], '개', 500),
('ICE_PACK', '아이스팩 700g', '대형 택배용', ARRAY['A2-750','YG-500'], '개', 300);

-- 테이프 1종
INSERT INTO packaging_materials (category, name, spec, sku_mapping, unit, safety_stock) VALUES
('TAPE', 'OPP 테이프', '48mm x 100m', ARRAY['A2-750','A2-180','YG-500','YG-180'], '롤', 50);
