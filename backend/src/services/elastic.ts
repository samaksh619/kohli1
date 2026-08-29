import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";

export const EMAILS_INDEX = "emails";

let client: Client | null = null;

function getClient(): Client | null {
  if (!env.ELASTIC_ENABLED) return null;
  if (!client) client = new Client({ node: env.ELASTICSEARCH_NODE });
  return client;
}

export async function ensureIndex() {
  const es = getClient();
  if (!es) return;
  const exists = await es.indices.exists({ index: EMAILS_INDEX });
  if (!exists) {
    await es.indices.create({
      index: EMAILS_INDEX,
      mappings: {
        properties: {
          toEmail: { type: "keyword" },
          subject: { type: "text" },
          body: { type: "text" },
          status: { type: "keyword" },
          userId: { type: "keyword" },
          senderId: { type: "keyword" },
          scheduledFor: { type: "date" },
          sentAt: { type: "date" },
        },
      },
    });
  }
}

export async function indexEmail(doc: {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  userId: string;
  senderId: string;
  scheduledFor: Date;
  sentAt?: Date | null;
}) {
  const es = getClient();
  if (!es) return; // ES is optional infra — never let indexing failures break sends
  try {
    await es.index({ index: EMAILS_INDEX, id: doc.id, document: doc });
  } catch (err) {
    console.error("[elastic] failed to index email", doc.id, err);
  }
}

export async function searchEmails(userId: string, query: string) {
  const es = getClient();
  if (!es) return [];
  const result = await es.search({
    index: EMAILS_INDEX,
    query: {
      bool: {
        filter: [{ term: { userId } }],
        must: query
          ? [
              {
                multi_match: {
                  query,
                  fields: ["subject", "body", "toEmail"],
                },
              },
            ]
          : [{ match_all: {} }],
      },
    },
    size: 50,
    sort: [{ scheduledFor: "desc" }],
  });
  return result.hits.hits.map((h) => h._source);
}
