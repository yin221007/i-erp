import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);

async function compose(name) {
  return parse(await readFile(new URL(`deploy/${name}`, root), 'utf8'));
}

function environmentValue(service, name) {
  const environment = service.environment;
  if (Array.isArray(environment)) {
    const entry = environment.find(value => value.startsWith(`${name}=`));
    return entry?.slice(name.length + 1);
  }
  return environment?.[name];
}

function publishedPort(service) {
  const entry = service.ports[0];
  if (typeof entry === 'string') return entry;
  return `${entry.host_ip || ''}:${entry.published}:${entry.target}`;
}

test('blue and green stacks are isolated and use immutable images', async () => {
  const [blue, green] = await Promise.all([
    compose('docker-compose.blue.yml'),
    compose('docker-compose.green.yml')
  ]);

  const blueNames = Object.values(blue.services).map(
    service => service.container_name
  );
  const greenNames = Object.values(green.services).map(
    service => service.container_name
  );
  assert.equal(blueNames.some(name => greenNames.includes(name)), false);
  assert.notEqual(
    publishedPort(blue.services.frontend),
    publishedPort(green.services.frontend)
  );
  assert.notEqual(blue.networks.default.name, green.networks.default.name);

  for (const stack of [blue, green]) {
    for (const serviceName of ['backend', 'frontend']) {
      const service = stack.services[serviceName];
      assert.match(service.image, /\$\{IERP_VERSION:\?/);
      assert.doesNotMatch(service.image, /:latest(?:$|\s)/);
      assert.ok(service.healthcheck);
      assert.ok(service.mem_limit);
      assert.equal(service.cpus, undefined);
      assert.ok(service.cpu_shares);
    }
    assert.equal(
      stack.services.frontend.depends_on.backend.condition,
      'service_healthy'
    );
  }
});

test('candidate data paths are configurable and green requires clone values', async () => {
  const [blue, green] = await Promise.all([
    compose('docker-compose.blue.yml'),
    compose('docker-compose.green.yml')
  ]);

  assert.match(environmentValue(blue.services.backend, 'DB_NAME'), /BLUE_DB_NAME/);
  assert.match(environmentValue(green.services.backend, 'DB_NAME'), /GREEN_DB_NAME:\?/);
  assert.match(blue.services.backend.volumes[0], /BLUE_UPLOADS_PATH/);
  assert.match(green.services.backend.volumes[0], /GREEN_UPLOADS_PATH:\?/);
  assert.doesNotMatch(
    environmentValue(green.services.backend, 'DB_NAME'),
    /\$\{GREEN_DB_NAME:-ierp\}/
  );
});

test('green service and network names can be isolated for clone rehearsal', async () => {
  const green = await compose('docker-compose.green.yml');

  assert.match(green.services.backend.container_name, /GREEN_BACKEND_CONTAINER/);
  assert.match(green.services.frontend.container_name, /GREEN_FRONTEND_CONTAINER/);
  assert.match(green.networks.default.name, /GREEN_NETWORK_NAME/);
});

test('nginx exposes live and backend readiness checks with the upload limit', async () => {
  const nginx = await readFile(new URL('nginx.conf', root), 'utf8');

  assert.match(nginx, /location = \/health\/live/);
  assert.match(nginx, /location = \/health\/ready/);
  assert.match(nginx, /proxy_pass http:\/\/backend:3000\/health\/ready/);
  assert.match(nginx, /client_max_body_size 100M/);
  assert.doesNotMatch(nginx, /51200M/);
});

test('the base stack contains no production host literals and bounds backups', async () => {
  const source = await readFile(new URL('docker-compose.yml', root), 'utf8');
  const stack = parse(source);

  assert.doesNotMatch(source, /192\.168\.100\.8/);
  assert.doesNotMatch(source, /:latest(?:$|\s)/);
  assert.ok(stack.services.backend.healthcheck);
  assert.ok(stack.services.frontend.healthcheck);
  assert.equal(stack.services.backup.mem_limit, '512m');
  assert.equal(stack.services.backup.cpus, undefined);
  assert.equal(stack.services.backup.cpu_shares, 512);
  assert.match(stack.services.backup.user, /NAS_UID/);
  assert.match(stack.services.backup.user, /NAS_GID/);
  assert.equal(
    environmentValue(stack.services.backup, 'BACKUP_CAPACITY_BYTES'),
    '536870912000'
  );
  assert.match(
    environmentValue(stack.services.backup, 'BACKUP_ID'),
    /BACKUP_ID/
  );
});

test('backend reads backups through a read-only mount and writes only to its queue', async () => {
  const source = await readFile(new URL('docker-compose.yml', root), 'utf8');
  const stack = parse(source);
  const backend = stack.services.backend;

  assert.equal(environmentValue(backend, 'BACKUP_ROOT'), '/app/backups');
  assert.equal(
    environmentValue(backend, 'MAINTENANCE_QUEUE_ROOT'),
    '/app/maintenance-queue'
  );
  assert.match(
    environmentValue(backend, 'MAINTENANCE_JOB_SECRET'),
    /MAINTENANCE_JOB_SECRET:\?/
  );
  assert.ok(backend.volumes.some(volume => /:\/app\/backups:ro$/.test(volume)));
  assert.ok(
    backend.volumes.some(volume => /:\/app\/maintenance-queue$/.test(volume))
  );
  assert.equal(
    backend.volumes.some(volume => volume.includes('/var/run/docker.sock')),
    false
  );
});

test('blue and green candidate backends receive isolated maintenance queues', async () => {
  const [blue, green] = await Promise.all([
    compose('docker-compose.blue.yml'),
    compose('docker-compose.green.yml')
  ]);

  assert.match(
    blue.services.backend.volumes.join('\n'),
    /BLUE_MAINTENANCE_QUEUE_PATH/
  );
  assert.match(
    green.services.backend.volumes.join('\n'),
    /GREEN_MAINTENANCE_QUEUE_PATH/
  );
  for (const stack of [blue, green]) {
    assert.equal(
      environmentValue(stack.services.backend, 'BACKUP_ROOT'),
      '/app/backups'
    );
    assert.equal(
      environmentValue(stack.services.backend, 'MAINTENANCE_QUEUE_ROOT'),
      '/app/maintenance-queue'
    );
  }
});

test('maintenance response binds only the local production frontend port', async () => {
  const source = await readFile(
    new URL('deploy/docker-compose.maintenance.yml', root),
    'utf8'
  );
  const stack = parse(source);
  const maintenance = stack.services.maintenance;
  const nginx = await readFile(
    new URL('deploy/maintenance/nginx.conf', root),
    'utf8'
  );

  assert.match(publishedPort(maintenance), /^127\.0\.0\.1:/);
  assert.match(publishedPort(maintenance), /FRONTEND_PORT/);
  assert.ok(maintenance.mem_limit);
  assert.match(nginx, /Retry-After/);
  assert.match(nginx, /return 503/);
});
