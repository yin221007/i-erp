import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignProjectIdentifiers,
  formatAutomaticProjectCode,
  getBeijingYearMonth
} from '../../server/services/project-identifiers.js';

const FIRST_UUID = '11111111-1111-4111-8111-111111111111';
const SECOND_UUID = '22222222-2222-4222-8222-222222222222';

class FakeProjectIdentifierConnection {
  constructor({ projects = [], sequences = {} } = {}) {
    this.projects = projects.map(project => structuredClone(project));
    this.sequences = new Map(
      Object.entries(sequences).map(([year, value]) => [Number(year), value])
    );
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT IGNORE INTO project_contract_sequences')) {
      const [year] = parameters;
      if (!this.sequences.has(year)) this.sequences.set(year, 0);
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('SELECT last_number FROM project_contract_sequences')) {
      const [year] = parameters;
      return [[{ last_number: this.sequences.get(year) }], []];
    }
    if (normalized === 'SELECT id, json_data FROM projects ORDER BY id FOR UPDATE') {
      return [this.projects.map(project => ({
        id: project.id,
        json_data: JSON.stringify(project)
      })), []];
    }
    if (normalized.startsWith('UPDATE project_contract_sequences SET last_number')) {
      const [lastNumber, year] = parameters;
      this.sequences.set(year, lastNumber);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

test('Beijing project date uses UTC+8 across the UTC year boundary', () => {
  assert.deepEqual(
    getBeijingYearMonth(new Date('2026-12-31T16:30:00.000Z')),
    { year: 2027, month: 1 }
  );
});

test('automatic project codes use creation month and an annual sequence', () => {
  assert.equal(
    formatAutomaticProjectCode(new Date('2026-08-18T02:00:00.000Z'), 17),
    '2026-08-017'
  );
  assert.equal(
    formatAutomaticProjectCode(new Date('2026-09-01T02:00:00.000Z'), 18),
    '2026-09-018'
  );
});

test('project identifiers use UUID v4 and continue the company annual sequence', async () => {
  const connection = new FakeProjectIdentifierConnection({
    sequences: { 2026: 16 }
  });
  const record = await assignProjectIdentifiers(
    connection,
    { name: '规范编号工程', internalContractNo: '' },
    {
      now: new Date('2026-08-18T02:00:00.000Z'),
      randomUUID: () => FIRST_UUID
    }
  );

  assert.equal(record.id, FIRST_UUID);
  assert.equal(record.code, '2026-08-017');
  assert.equal(record.internalContractNo, '2026-08-017');
  assert.equal(record.createdAt, '2026-08-18T02:00:00.000Z');
  assert.equal(connection.sequences.get(2026), 17);
});

test('sequence writes maintain the required database timestamp', async () => {
  const statements = [];
  const statementParameters = [];
  const baseConnection = new FakeProjectIdentifierConnection();
  const connection = {
    async query(sql, parameters) {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      statementParameters.push(parameters);
      return baseConnection.query(sql, parameters);
    }
  };

  await assignProjectIdentifiers(
    connection,
    { name: '时间戳约束工程' },
    {
      now: new Date('2026-08-18T02:00:00.000Z'),
      randomUUID: () => FIRST_UUID
    }
  );

  assert.match(statements[0], /updated_at\) VALUES \(\?, 0, CURRENT_TIMESTAMP\(3\)\)/);
  assert.match(statements.at(-1), /updated_at = CURRENT_TIMESTAMP\(3\)/);
  const lockedYears = statements
    .map((statement, index) => ({ statement, parameters: statementParameters[index] }))
    .filter(({ statement }) => statement.startsWith('SELECT last_number'))
    .map(({ parameters }) => parameters[0]);
  assert.deepEqual(lockedYears, [0, 2026]);
});

test('manual internal contract numbers take priority and still consume the annual position', async () => {
  const connection = new FakeProjectIdentifierConnection({
    sequences: { 2026: 17 }
  });
  const record = await assignProjectIdentifiers(
    connection,
    { name: '人工编号工程', internalContractNo: ' IN-2026-018 ' },
    {
      now: new Date('2026-09-01T02:00:00.000Z'),
      randomUUID: () => SECOND_UUID
    }
  );

  assert.equal(record.code, 'IN-2026-018');
  assert.equal(record.internalContractNo, 'IN-2026-018');
  assert.equal(connection.sequences.get(2026), 18);
});

test('duplicate project codes are rejected before the annual sequence changes', async () => {
  const connection = new FakeProjectIdentifierConnection({
    projects: [{ id: 'legacy', code: 'IN-2026-018' }],
    sequences: { 2026: 17 }
  });

  await assert.rejects(
    () => assignProjectIdentifiers(
      connection,
      { name: '重复编号工程', internalContractNo: 'in-2026-018' },
      {
        now: new Date('2026-09-01T02:00:00.000Z'),
        randomUUID: () => SECOND_UUID
      }
    ),
    error => error?.statusCode === 409
  );
  assert.equal(connection.sequences.get(2026), 17);
});
