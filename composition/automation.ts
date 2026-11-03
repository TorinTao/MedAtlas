import { createTaskRunner } from "../modules/automation/runner";
import { refreshLiterature } from "./jobs/refresh";
import { enrichMissingPapers, enrichMissingRepositories } from "./jobs/enrich";
import { backfillMissingSummaries } from "./jobs/summaries";
import { backfillPublicationVenues } from "./jobs/venues";
export const backgroundTasks = createTaskRunner({
    refresh_literature: refreshLiterature,
    enrich_missing_papers: () => enrichMissingPapers(),
    enrich_missing_repositories: () => enrichMissingRepositories(),
    backfill_paper_summaries: () => backfillMissingSummaries(),
    backfill_publication_venues: () => backfillPublicationVenues(),
});
