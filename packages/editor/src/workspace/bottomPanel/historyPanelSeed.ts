/**
 * historyPanelSeed — registers the "History" bottom-panel tab (Phase G, #197).
 * Side-effect import from BottomPanel.tsx, mirroring seedTabs.ts.
 */
import * as React from 'react'

import { registerBottomPanelTab } from './bottomPanelRegistry'
import { HistoryPanel } from '../history/HistoryPanel'

registerBottomPanelTab({
  id: 'history',
  title: 'History',
  icon: 'history',
  content: React.createElement(HistoryPanel),
})
