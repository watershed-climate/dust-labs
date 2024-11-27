import axios, { AxiosResponse } from "axios";
import * as dotenv from "dotenv";
import Bottleneck from "bottleneck";

dotenv.config();

const PAGERDUTY_API_KEY = process.env.PAGERDUTY_API_KEY;
const DUST_API_KEY = process.env.DUST_API_KEY;
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID;
const DUST_VAULT_ID = process.env.DUST_VAULT_ID;
const DUST_DATASOURCE_ID = process.env.DUST_DATASOURCE_ID;

if (
  !PAGERDUTY_API_KEY ||
  !DUST_API_KEY ||
  !DUST_WORKSPACE_ID ||
  !DUST_VAULT_ID ||
  !DUST_DATASOURCE_ID
) {
  throw new Error(
    "Please provide values for PAGERDUTY_API_KEY, DUST_API_KEY, DUST_WORKSPACE_ID, DUST_VAULT_ID, and DUST_DATASOURCE_ID in .env file."
  );
}

// Default to fetching schedules for the next 30 days
const SINCE = new Date().toISOString();
const UNTIL = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const pagerdutyApi = axios.create({
  baseURL: "https://api.pagerduty.com",
  headers: {
    Accept: "application/vnd.pagerduty+json;version=2",
    Authorization: `Token token=${PAGERDUTY_API_KEY}`,
    "Content-Type": "application/json",
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

const dustApi = axios.create({
  baseURL: "https://dust.tt/api/v1",
  headers: {
    Authorization: `Bearer ${DUST_API_KEY}`,
    "Content-Type": "application/json",
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

// Set up rate limiting for API calls
const limiter = new Bottleneck({
  minTime: 500, // 500ms between tasks
  maxConcurrent: 1, // Run 1 task at a time
});

interface PagerDutySchedule {
  id: string;
  name: string;
  description: string;
  time_zone: string;
  final_schedule: {
    rendered_schedule_entries: {
      start: string;
      end: string;
      user: {
        id: string;
        summary: string;
        email: string;
      };
    }[];
  };
}

async function getPagerDutySchedules(): Promise<PagerDutySchedule[]> {
  let allSchedules: PagerDutySchedule[] = [];
  let offset = 0;
  const limit = 25;

  console.log(`Retrieving all schedules from ${SINCE} to ${UNTIL}`);

  do {
    try {
      const response: AxiosResponse<{
        schedules: PagerDutySchedule[];
        more: boolean;
      }> = await pagerdutyApi.get("/schedules", {
        params: {
          limit,
          offset,
          since: SINCE,
          until: UNTIL,
          time_zone: "UTC",
        },
      });

      allSchedules = allSchedules.concat(response.data.schedules);
      console.log(
        `Retrieved ${response.data.schedules.length} schedules. Total: ${allSchedules.length}`
      );

      if (!response.data.more) {
        break;
      }
      offset += limit;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(
          "Error fetching PagerDuty schedules:",
          error.response.data
        );
      } else {
        console.error("Error fetching PagerDuty schedules:", error);
      }
      break;
    }
  } while (true);

  return allSchedules;
}

async function upsertToDustDatasource(schedule: PagerDutySchedule) {
  const documentId = `pagerduty-schedule-${schedule.id}`;

  let content = `Schedule ID: ${schedule.id}\n`;
  content += `Name: ${schedule.name}\n`;
  if (schedule.description) content += `Description: ${schedule.description}\n`;
  content += `Time Zone: ${schedule.time_zone}\n\n`;

  content += "# Schedule Entries\n";
  schedule.final_schedule.rendered_schedule_entries.forEach((entry) => {
    content += `\n## Shift\n`;
    content += `Start: ${new Date(entry.start).toLocaleString()}\n`;
    content += `End: ${new Date(entry.end).toLocaleString()}\n`;
    content += `On-Call: ${entry.user.summary} (${entry.user.email})\n`;
  });

  try {
    await limiter.schedule(() =>
      dustApi.post(
        `/w/${DUST_WORKSPACE_ID}/vaults/${DUST_VAULT_ID}/data_sources/${DUST_DATASOURCE_ID}/documents/${documentId}`,
        {
          text: content.trim(),
          source_url: `https://your-subdomain.pagerduty.com/schedules/${schedule.id}`,
        }
      )
    );
    console.log(`Upserted schedule ${schedule.id} to Dust datasource`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error(
        `Error upserting schedule ${schedule.id} to Dust datasource:`,
        error.response.data
      );
    } else {
      console.error(
        `Error upserting schedule ${schedule.id} to Dust datasource:`,
        error
      );
    }
  }
}

async function main() {
  try {
    const schedules = await getPagerDutySchedules();
    console.log(`Found ${schedules.length} schedules.`);

    for (const schedule of schedules) {
      await upsertToDustDatasource(schedule);
    }

    console.log("All schedules processed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
