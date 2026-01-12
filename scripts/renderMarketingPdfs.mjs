import path from 'node:path';
import { promises as fs } from 'node:fs';
import { mdToPdf } from 'md-to-pdf';

const root = process.cwd();
const stylePath = path.join(root, 'docs', 'marketing', 'pdf-style.css');
const outputDir = path.join(root, 'public', 'marketing');

const sources = [
  {
    input: path.join(root, 'docs', 'marketing', 'agent-playbook.md'),
    output: path.join(outputDir, 'agent-playbook.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'agent-start-free-course.md'),
    output: path.join(outputDir, 'agent-start-free-course.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'partner-playbook.md'),
    output: path.join(outputDir, 'partner-playbook.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'partner-course.md'),
    output: path.join(outputDir, 'partner-course.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'sales-deck.md'),
    output: path.join(outputDir, 'sales-deck.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'one-pager.md'),
    output: path.join(outputDir, 'one-pager.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'case-study-template.md'),
    output: path.join(outputDir, 'case-study-template.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'demo-checklist.md'),
    output: path.join(outputDir, 'demo-checklist.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'revenue-recovery-handbook.md'),
    output: path.join(outputDir, 'revenue-recovery-handbook.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'field-operations-manual.md'),
    output: path.join(outputDir, 'field-operations-manual.pdf'),
  },
  {
    input: path.join(root, 'docs', 'marketing', 'ghost-shopper-audit-template.md'),
    output: path.join(outputDir, 'ghost-shopper-audit-template.pdf'),
  },
];

await fs.mkdir(outputDir, { recursive: true });

for (const source of sources) {
  const result = await mdToPdf(
    { path: source.input },
    {
      dest: source.output,
      stylesheet: [stylePath],
      pdf_options: {
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.6in',
          right: '0.6in',
          bottom: '0.6in',
          left: '0.6in',
        },
      },
    },
  );

  if (!result) {
    throw new Error(`Failed to render ${source.input}`);
  }
}

console.log('Marketing PDFs generated in public/marketing.');
