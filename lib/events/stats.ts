import type { Db } from 'mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';

// WHAT: The numbers on an event's overview: the pictures of the event and how many distinct e-mail addresses came with them.
// WHY: it lived in lib/tryon/analytics.ts with the try-on analytics (issue 557, docs/TRYON_REMOVED.md); the try-on count and the
// "original captures" count (the same number without try-on results) went with the integration.
export interface EventSpecificStats {
  totalSubmissions: number;
  uniqueEmailsCount: number;
  cleanCustomerEmailsCount: number;
}

export async function collectEventSpecificStats(
  db: Db,
  eventId: string
): Promise<EventSpecificStats> {
  const aggregationResult = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).aggregate([
    {
      $match: {
        $and: [
          { $or: [{ eventId }, { eventIds: { $in: [eventId] } }] },
          { isArchived: { $ne: true } },
          // A stored try-on result is not a picture of the event any more (issue 557): it is not counted.
          { submissionKind: { $ne: 'tryon_result' } }
        ]
      }
    },
    {
      $project: {
        email: {
          $let: {
            vars: {
              rawEmail: {
                $ifNull: [
                  "$userEmail",
                  "$userInfo.email",
                  "$metadata.emailRecipient",
                  ""
                ]
              }
            },
            in: {
              $cond: [
                { $eq: [ { $type: "$$rawEmail" }, "string" ] },
                { $trim: { input: { $toLower: "$$rawEmail" } } },
                ""
              ]
            }
          }
        }
      }
    },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              totalSubmissions: { $sum: 1 }
            }
          }
        ],
        uniqueEmails: [
          { $match: { email: { $ne: "" } } },
          { $group: { _id: "$email" } },
          { $count: "count" }
        ],
        cleanCustomerEmails: [
          {
            $match: {
              email: {
                $nin: ["", null, "anonymous@event", "m@m.m", "moldovancsaba@gmail.com"],
                $not: /@seyuselfies\.com$|\.seyuselfies\.com$/
              }
            }
          },
          { $group: { _id: "$email" } },
          { $count: "count" }
        ]
      }
    }
  ]).next() as unknown as {
    counts: Array<{
      totalSubmissions: number;
    }>;
    uniqueEmails: Array<{ count: number }>;
    cleanCustomerEmails: Array<{ count: number }>;
  } | null;

  const counts = aggregationResult?.counts?.[0] || { totalSubmissions: 0 };
  const uniqueEmailsCount = aggregationResult?.uniqueEmails?.[0]?.count || 0;
  const cleanCustomerEmailsCount = aggregationResult?.cleanCustomerEmails?.[0]?.count || 0;

  return {
    totalSubmissions: counts.totalSubmissions,
    uniqueEmailsCount,
    cleanCustomerEmailsCount,
  };
}
