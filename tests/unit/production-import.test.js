import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProductionStatus,
  rowsToProductionUnits
} from '../../lib/production-import.js';

test('智能产业园清单按尺寸列和备注列映射生产记录', () => {
  const rows = [
    ['仪征经济开发区生活保障用品报价清单'],
    ['编号', '产品名称', '尺寸(WxDxH)（mm)', '技术参数', '品牌', '数量', '单位', '单价', '金额', '备注'],
    ['Aa男女更衣室，收货区'],
    ['Aa1', '更衣柜', '900*500*1800', '', '', '2', '台', '', '', '待定'],
    ['Aa2', '洗手池', '600*600*800', '', '', '1', '台', '', '', '已生产'],
    ['Aa3', '工作台', '1200*700*800', '', '', '3', '台', '', '', '已入库'],
    ['Aa4', '送餐车', '900*500*900', '', '', '4', '台', '', '', '已发'],
    ['Aa5', '保温车', '1000*600*900', '', '', '5', '台', '', '', '已发货']
  ];

  const items = rowsToProductionUnits(rows, 'Waiting', {
    defaultDate: '2026-07-27'
  });

  assert.equal(items.length, 5);
  assert.deepEqual(
    items.map(({ serialNumber, sourceOrder, name, model, actualProductionSpec, quantity, status, notes, batchDate }) => ({
      serialNumber,
      sourceOrder,
      name,
      model,
      actualProductionSpec,
      quantity,
      status,
      notes,
      batchDate
    })),
    [
      { serialNumber: 'Aa1', sourceOrder: 1, name: '更衣柜', model: '900*500*1800', actualProductionSpec: '900*500*1800', quantity: 2, status: 'Waiting', notes: '待定', batchDate: '2026-07-27' },
      { serialNumber: 'Aa2', sourceOrder: 2, name: '洗手池', model: '600*600*800', actualProductionSpec: '600*600*800', quantity: 1, status: 'InStock', notes: '已生产', batchDate: '2026-07-27' },
      { serialNumber: 'Aa3', sourceOrder: 3, name: '工作台', model: '1200*700*800', actualProductionSpec: '1200*700*800', quantity: 3, status: 'InStock', notes: '已入库', batchDate: '2026-07-27' },
      { serialNumber: 'Aa4', sourceOrder: 4, name: '送餐车', model: '900*500*900', actualProductionSpec: '900*500*900', quantity: 4, status: 'Shipped', notes: '已发', batchDate: '2026-07-27' },
      { serialNumber: 'Aa5', sourceOrder: 5, name: '保温车', model: '1000*600*900', actualProductionSpec: '1000*600*900', quantity: 5, status: 'Shipped', notes: '已发货', batchDate: '2026-07-27' }
    ]
  );
});

test('未完成状态不会因含有单个发字被误判为已发货', () => {
  assert.equal(resolveProductionStatus('待发货', 'Waiting'), 'Waiting');
  assert.equal(resolveProductionStatus('未发货', 'Waiting'), 'Waiting');
  assert.equal(resolveProductionStatus('不好安装，不制作', 'Waiting'), 'Waiting');
});

test('重新导入系统导出的清单时保留实际生产规格', () => {
  const items = rowsToProductionUnits([
    ['编号', '设备名称', '清单规格/型号', '实际生产规格', '数量', '状态'],
    ['A-1', '工作台', '1200*700*800', '1180*680*800', '2', '待生产']
  ], 'Waiting', { defaultDate: '2026-07-28' });

  assert.equal(items.length, 1);
  assert.equal(items[0].model, '1200*700*800');
  assert.equal(items[0].actualProductionSpec, '1180*680*800');
});
