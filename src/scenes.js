// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Scan the libraries for new files (administrator account: Komga scans in the
// background), and read the latest additions as a sentence (for a "say" or a
// notification: "2 new series on Komga in the last 7 days: A and B.").
// Nothing destructive.
// -----------------------------------------------------------------------------

import { pick } from './texts.js';

export const SCENE_ACTIONS = {
  async scan_library(hub, { fields = {} }) {
    const { libraries } = await hub.scanLibraries(fields.library);
    return { libraries };
  },

  async read_latest_additions(hub) {
    const { sentence, count, title } = await hub.latestAdditions();
    return { sentence: pick(sentence, hub.config.language), count, title };
  },
};
