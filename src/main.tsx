import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { Shell } from './ui/shell';
import { CommandCentre, ServicePage, Worklists, Patient360 } from './ui/pages1';
import { WorkflowStudio } from './ui/studio';
import { ReviewQueue, Tasks, Communications, IntegrationHub, Analytics, Governance, Administration } from './ui/pages2';

const pages = {
  command: CommandCentre, fls: () => <ServicePage service="fls" />, med: () => <ServicePage service="med" />, studio: WorkflowStudio,
  worklists: Worklists, patient: Patient360, reviews: ReviewQueue, tasks: Tasks, comms: Communications, integrations: IntegrationHub,
  analytics: Analytics, governance: Governance, admin: Administration,
};
createRoot(document.getElementById('root')!).render(<Shell pages={pages} />);
