import type { Ionicons } from '@expo/vector-icons';

export type NoteTemplateIcon = keyof typeof Ionicons.glyphMap;

export interface NoteTemplate {
  id: string;
  name: string;
  icon: NoteTemplateIcon;
  description: string;
  title?: string;
  content: string;
  tags: string[];
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Note',
    icon: 'document-outline',
    description: 'Start with a clean slate',
    content: '',
    tags: [],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    icon: 'people-outline',
    description: 'Document meeting discussions and action items',
    title: 'Meeting Notes - ',
    content: `## Attendees
- 

## Agenda
1. 

## Discussion Points


## Action Items
- [ ] 

## Next Steps

`,
    tags: ['meeting', 'work'],
  },
  {
    id: 'bug-report',
    name: 'Bug Report',
    icon: 'bug-outline',
    description: 'Track bugs and issues',
    title: 'Bug: ',
    content: `## Bug Description


## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior


## Actual Behavior


## Environment
- OS: 
- Version: 
- Device: 

## Screenshot/Logs

`,
    tags: ['bug', 'development'],
  },
  {
    id: 'feature-request',
    name: 'Feature Request',
    icon: 'bulb-outline',
    description: 'Document new feature ideas',
    title: 'Feature: ',
    content: `## Feature Name


## Problem Statement
What problem does this solve?

## Proposed Solution


## User Stories
As a [type of user], I want [goal] so that [benefit].

## Acceptance Criteria
- [ ] 
- [ ] 
- [ ] 

## Technical Notes


## Priority
- [ ] High
- [ ] Medium
- [ ] Low

`,
    tags: ['feature', 'planning'],
  },
  {
    id: 'code-snippet',
    name: 'Code Snippet',
    icon: 'code-slash-outline',
    description: 'Save useful code examples',
    title: 'Snippet: ',
    content: `## Language/Framework


## Description


## Code
\`\`\`
\`\`\`

## Usage Example


## Notes

`,
    tags: ['code', 'reference'],
  },
  {
    id: 'daily-standup',
    name: 'Daily Standup',
    icon: 'sunny-outline',
    description: 'Daily progress update',
    title: 'Standup - ',
    content: `## Yesterday
- 

## Today
- 

## Blockers
- None
- 

## Notes

`,
    tags: ['daily', 'standup'],
  },
  {
    id: 'pr-review',
    name: 'PR Review',
    icon: 'git-pull-request-outline',
    description: 'Review pull requests',
    title: 'PR Review: ',
    content: `## PR Details
- **Number:** #
- **Author:** 
- **URL:** 

## Summary


## Changes Overview
- 

## Review Notes


## Approval Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] No security issues
- [ ] Documentation updated

## Comments


## Decision
- [ ] Approve
- [ ] Request changes
- [ ] Comment

`,
    tags: ['pr', 'review', 'code'],
  },
  {
    id: 'api-documentation',
    name: 'API Documentation',
    icon: 'document-text-outline',
    description: 'Document API endpoints',
    title: 'API: ',
    content: `## Endpoint


## Method
GET / POST / PUT / DELETE

## URL Parameters
| Name | Type | Description |
|------|------|-------------|
|      |      |             |

## Request Body


## Response

### Success (200)
\`\`\`json
\`\`\`

### Error (4xx/5xx)
\`\`\`json
\`\`\`

## Example Request


## Notes

`,
    tags: ['api', 'documentation'],
  },
];

export class TemplateService {
  // Optional dynamic loader hook. In real deployments this could fetch templates
  // from a server, plugin registry, or local storage. Falls back to NOTE_TEMPLATES.
  static async loadTemplatesFromRemote(): Promise<NoteTemplate[] | null> {
    // Placeholder for future remote loading logic
    return null;
  }

  static async getTemplates(): Promise<NoteTemplate[]> {
    try {
      const dynamic = await this.loadTemplatesFromRemote();
      if (Array.isArray(dynamic) && dynamic.length > 0) {
        return dynamic;
      }
      return NOTE_TEMPLATES;
    } catch (error) {
      console.error('[TemplateService] Failed to load templates:', error);
      return NOTE_TEMPLATES;
    }
  }

  static async getAllTemplates(): Promise<NoteTemplate[]> {
    return this.getTemplates();
  }

  static async getTemplateById(id: string): Promise<NoteTemplate | undefined> {
    const templates = await this.getTemplates();
    return templates.find((template) => template.id === id);
  }

  static async getTemplatesByTag(tag: string): Promise<NoteTemplate[]> {
    const templates = await this.getTemplates();
    return templates.filter((template) => template.tags.includes(tag));
  }

  static async searchTemplates(query: string): Promise<NoteTemplate[]> {
    const templates = await this.getTemplates();
    const lowerQuery = query.toLowerCase();
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some((tag) => tag.includes(lowerQuery))
    );
  }
}

export default TemplateService;
