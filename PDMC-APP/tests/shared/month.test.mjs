import test from "node:test";
import assert from "node:assert/strict";
import {currentMonth,monthKey,monthLabel,monthRange} from "../../shared/month.ts";

test("el corte mensual usa límites exactos y conserva meses históricos",()=>{
  assert.match(currentMonth(),/^\d{4}-\d{2}$/);
  assert.equal(monthKey(new Date("2026-10-01T03:30:00.000Z")),"2026-09");
  assert.equal(monthKey(new Date("2026-10-01T04:30:00.000Z")),"2026-10");
  assert.deepEqual(monthRange("2026-12"),{gte:new Date("2026-12-01T00:00:00.000Z"),lt:new Date("2027-01-01T00:00:00.000Z")});
  assert.match(monthLabel("2026-08"),/agosto.*2026/i);
  assert.throws(()=>monthRange("2026-13"),/Mes inválido/);
});
