/**
 * Search Events tool - search and filter events with powerful options.
 */

import { z } from 'zod';
import { toolsMetadata } from '../../config/metadata.js';
import { GoogleCalendarClient, type CalendarEvent } from '../../services/google-calendar.js';
import { defineTool, type ToolResult } from './types.js';

const DEFAULT_FIELDS = ['id', 'summary', 'start', 'end', 'location', 'htmlLink', 'status'];

const ALL_FIELDS = [
  'id',
  'summary',
  'description',
  'start',
  'end',
  'location',
  'attendees',
  'organizer',
  'creator',
  'htmlLink',
  'hangoutLink',
  'conferenceData',
  'status',
  'eventType',
  'visibility',
  'colorId',
  'recurringEventId',
  'recurrence',
];

const InputSchema = z.object({
  calendarId: z.string().optional().describe('Calendar ID (defaults to "primary")'),
  timeMin: z.string().optional().describe('Start of time range (ISO 8601)'),
  timeMax: z.string().optional().describe('End of time range (ISO 8601)'),
  query: z.string().optional().describe('Text search (matches title, description, location, attendees)'),
  maxResults: z.number().int().min(1).max(250).optional().default(50).describe('Max events to return'),
  eventTypes: z
    .array(z.enum(['default', 'birthday', 'focusTime', 'outOfOffice', 'workingLocation']))
    .optional()
    .describe('Filter by event type'),
  orderBy: z.enum(['startTime', 'updated']).optional().describe('Sort order'),
  pageToken: z.string().optional().describe('Token for pagination'),
  fields: z.array(z.string()).optional().describe('Fields to include in response'),
  singleEvents: z.boolean().optional().default(true).describe('Expand recurring events into instances'),
});

function formatEventLine(event: CalendarEvent): string {
  const start = event.start?.dateTime || event.start?.date || 'no date';
  const title = event.summary || '(no title)';
  const status = event.status ? ` [${event.status}]` : '';

  if (event.htmlLink) {
    return `- [${title}](${event.htmlLink}) — ${start}${status}`;
  }
  return `- ${title} — ${start}${status}`;
}

function pickFields(event: CalendarEvent, fields: string[]): Partial<CalendarEvent> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in event) {
      result[field] = (event as Record<string, unknown>)[field];
    }
  }
  return result as Partial<CalendarEvent>;
}

export const searchEventsTool = defineTool({
  name: toolsMetadata.search_events.name,
  title: toolsMetadata.search_events.title,
  description: toolsMetadata.search_events.description,
  inputSchema: InputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  handler: async (args, context): Promise<ToolResult> => {
    const token = context.providerToken;

    if (!token) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required. Please authenticate with Google Calendar.' }],
      };
    }

    const client = new GoogleCalendarClient(token);

    try {
      const result = await client.listEvents({
        calendarId: args.calendarId,
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        maxResults: args.maxResults,
        singleEvents: args.singleEvents,
        orderBy: args.singleEvents ? (args.orderBy || 'startTime') : args.orderBy,
        q: args.query,
        eventTypes: args.eventTypes,
        pageToken: args.pageToken,
      });

      const fields = args.fields && args.fields.length > 0 ? args.fields : DEFAULT_FIELDS;
      const filteredItems = result.items.map((event) => pickFields(event, fields));

      // Format for LLM consumption
      const lines: string[] = [];

      if (result.items.length === 0) {
        lines.push('No events found matching the criteria.');
      } else {
        lines.push(`Found ${result.items.length} event(s):\n`);

        for (const event of result.items) {
          lines.push(formatEventLine(event));

          if (event.location) {
            lines.push(`  location: ${event.location}`);
          }
          if (event.attendees && event.attendees.length > 0) {
            const attendeeList = event.attendees.slice(0, 5).map((a) => a.email).join(', ');
            const more = event.attendees.length > 5 ? ` +${event.attendees.length - 5} more` : '';
            lines.push(`  attendees: ${attendeeList}${more}`);
          }
          if (event.hangoutLink) {
            lines.push(`  meet: ${event.hangoutLink}`);
          }
        }
      }

      if (result.nextPageToken) {
        lines.push(`\nMore results available. Pass pageToken: "${result.nextPageToken}" to fetch next page.`);
      }

      lines.push("\nNext: Use eventId with 'update_event' or 'delete_event'.");

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          items: filteredItems,
          nextPageToken: result.nextPageToken,
        },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to search events: ${(error as Error).message}` }],
      };
    }
  },
});


