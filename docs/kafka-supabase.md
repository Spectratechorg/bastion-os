# Apache Kafka to Supabase Ingestion Pipeline

BastionOS uses **Method 1 (Node.js High-Throughput Consumer)** to ingest live streaming telemetry (such as GPS coordinates, battery levels, speed, and accuracy) from **Apache Kafka** directly into **Supabase PostgreSQL**.

---

## Architecture Flow

```
[Guard Devices / IoT]
        │
        ▼ (GPS Pings)
[Apache Kafka Topic] (e.g., 'guard-gps-pings')
        │
        ▼ (kafkajs eachBatch)
[BastionOS Kafka Worker] (`scripts/kafka-worker.ts`)
        │
        ├── 1. Validates payload via Zod (`lib/kafka/types.ts`)
        ├── 2. Bulk inserts into `guard_locations` table
        └── 3. Updates `guards` table (`lastCheckIn`, `lastLatitude`, `lastLongitude`)
        │
        ▼ (Port 6543 IPv4 Supavisor Pooler)
[Supabase PostgreSQL] ──► [Live Map in BastionOS UI]
```

---

## 1. Database Schema (`guard_locations`)

Migration `0010_natural_katie_power.sql` creates the `guard_locations` table in Supabase:

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key (auto-generated) |
| `organization_id` | `text` | Foreign key to `organization.id` |
| `guard_id` | `uuid` | Foreign key to `guards.id` |
| `site_id` | `uuid` | Foreign key to `sites.id` (nullable) |
| `latitude` | `double precision` | Current GPS latitude |
| `longitude` | `double precision` | Current GPS longitude |
| `battery_level` | `integer` | Device battery percentage (0-100) |
| `accuracy` | `double precision` | GPS accuracy in meters |
| `speed` | `double precision` | Movement speed in m/s |
| `source` | `text` | Stream source (default `'kafka'`) |
| `recorded_at` | `timestamptz` | Device timestamp |
| `created_at` | `timestamptz` | Insertion timestamp |

---

## 2. Environment Variables

Add these to `.env.local` (or production environment in Vercel/Railway):

```env
# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=guard-gps-pings
KAFKA_GROUP_ID=bastion-guard-pings
KAFKA_CLIENT_ID=bastion-os-ingestor

# Supabase (Already configured)
DATABASE_URL=postgresql://postgres.ypqhzjofslkhqcqhmgxe:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

---

## 3. Running the Worker

To start the Kafka consumer worker as a standalone background service:

```bash
pnpm worker:kafka
```

The worker connects to the Kafka cluster, subscribes to the topic, batches incoming messages using `eachBatch`, and performs single-query bulk writes to Supabase through the connection pooler.

---

## 4. Testing & Simulating GPS Pings

A simulation tool is provided at `scripts/kafka-simulate.ts`:

- **Direct Database Test**:
  ```bash
  pnpm sim:kafka
  ```
- **Kafka Publish Test**:
  ```bash
  pnpm sim:kafka --kafka
  ```

---

## 5. Automated Tests

Run the test suite to verify schema validation and configuration:

```bash
pnpm test
```
All tests cover payload parsing, coordinate limits (-90..90, -180..180), required IDs, and Kafka configuration overrides.
