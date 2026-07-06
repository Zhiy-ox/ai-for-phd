// Oxford DPhil programme template. This file is DATA: the dashboard, stage
// pages, viva panel, and rubrics all render from it. To support another
// programme, add a sibling file and register it in src/lib/template.ts.
import type { ProgrammeTemplate } from "@/lib/template";

export const oxfordDphil: ProgrammeTemplate = {
  id: "oxford-dphil",
  name: "Oxford DPhil",
  institutionNote:
    "Milestones follow the University of Oxford Graduate Studies Office (GSO) forms and typical MPLS division timings. Exact deadlines vary by department — edit target dates to match yours.",
  timeUnit: "term",
  stages: [
    {
      id: "prs-start",
      title: "Probationer Research Student",
      ordinal: 0,
      description:
        "You are admitted as a Probationer Research Student (PRS). Terms 1–3 are about scoping the project: literature review, research proposal, first experiments, and training courses.",
      typicalTiming: { from: 1, to: 3, label: "Terms 1–3" },
      gate: { type: "none" },
      requiredDocuments: [
        {
          id: "proposal",
          title: "Research proposal",
          description: "The working plan for the doctorate — question, approach, and why it matters.",
        },
        {
          id: "lit-review",
          title: "Literature review draft",
          description: "Survey of the field establishing where your project sits.",
        },
      ],
      activities: ["writing_support", "doc_feedback"],
      implemented: false,
    },
    {
      id: "transfer",
      title: "Transfer of Status",
      ordinal: 1,
      description:
        "The first formal gate: transfer from PRS to full DPhil status. You submit a transfer report (GSO.2) and defend it in an interview with two assessors who judge whether the project can grow into a doctorate.",
      typicalTiming: { from: 3, to: 4, label: "Terms 3–4" },
      gate: { type: "report_and_viva", formRef: "GSO.2" },
      requiredDocuments: [
        {
          id: "transfer_report",
          title: "Transfer report",
          description:
            "Typically 10–20 pages: motivation, literature, methods, results to date, and a plan for the full DPhil.",
        },
        {
          id: "supporting",
          title: "Supporting material (optional)",
          description: "Proposal, key papers, or manuscript drafts the assessors may draw on.",
        },
      ],
      activities: ["doc_feedback", "mock_viva", "writing_support"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "internal",
            name: "Dr Chen",
            role: "Internal assessor",
            style:
              "Methodical and detail-oriented. Works through the report section by section, presses on experimental design, controls, error analysis, and whether the stated plan is achievable in the time remaining.",
            focus: ["methodology", "results", "feasibility"],
          },
          {
            id: "external",
            name: "Prof Whitfield",
            role: "Second assessor",
            style:
              "Big-picture and comparative. Asks where the work sits in the field, what is genuinely new, which competing approaches exist, and whether the candidate understands the wider literature beyond their own niche.",
            focus: ["originality", "knowledge", "writing"],
          },
        ],
        rubric: [
          {
            id: "originality",
            title: "Originality & significance",
            description:
              "Does the project promise a distinct, worthwhile contribution to the field rather than incremental repetition?",
            weight: 1,
          },
          {
            id: "methodology",
            title: "Methodology",
            description:
              "Are the methods appropriate, rigorous, and well understood by the candidate — including limitations and alternatives?",
            weight: 1,
          },
          {
            id: "results",
            title: "Progress & results to date",
            description:
              "Is there enough credible preliminary work to show the project is off the ground?",
            weight: 1,
          },
          {
            id: "feasibility",
            title: "Feasibility of the DPhil plan",
            description:
              "Can the proposed programme of work realistically be completed to doctoral standard in the time available?",
            weight: 1,
          },
          {
            id: "knowledge",
            title: "Subject knowledge",
            description:
              "Does the candidate command the relevant literature and underlying theory, beyond their immediate experiments?",
            weight: 1,
          },
          {
            id: "writing",
            title: "Quality of the written report",
            description:
              "Is the report clearly structured, well argued, and of the standard expected of a doctoral researcher?",
            weight: 0.5,
          },
        ],
        verdicts: [
          {
            id: "approved",
            label: "Transfer approved",
            description: "The candidate transfers to full DPhil status.",
          },
          {
            id: "referred",
            label: "Referred",
            description:
              "Not yet ready — revise the report and re-apply. One further attempt is permitted.",
          },
          {
            id: "msc_route",
            label: "Recommend MSc route",
            description:
              "The work is better suited to completion as a master's degree than a doctorate.",
          },
        ],
      },
    },
    {
      id: "confirmation",
      title: "Confirmation of Status",
      ordinal: 2,
      description:
        "The second gate (GSO.14): confirm that the DPhil is on track for completion. Another report and interview, this time judged against the finish line — thesis outline, remaining work, and timetable.",
      typicalTiming: { from: 6, to: 9, label: "Terms 6–9" },
      gate: { type: "report_and_viva", formRef: "GSO.14" },
      requiredDocuments: [
        {
          id: "confirmation_report",
          title: "Confirmation report",
          description:
            "Progress since transfer, thesis outline with chapter plan, and a timetable to submission.",
        },
      ],
      activities: ["doc_feedback", "mock_viva", "writing_support"],
      implemented: false,
    },
    {
      id: "papers",
      title: "Papers & Rebuttals",
      ordinal: 3,
      description:
        "Ongoing throughout: writing journal/conference papers, surviving peer review, and drafting rebuttal letters. The AI plays Reviewer 2 so the real one hurts less.",
      typicalTiming: { from: 3, to: 12, label: "Recurring" },
      gate: { type: "recurring" },
      requiredDocuments: [
        {
          id: "manuscript",
          title: "Manuscript draft",
          description: "A paper draft for review-style feedback.",
        },
        {
          id: "reviews",
          title: "Referee reports",
          description: "Reviewer comments to rebut.",
        },
      ],
      activities: ["doc_feedback", "rebuttal_roleplay", "writing_support"],
      implemented: false,
    },
    {
      id: "thesis",
      title: "Thesis Writing & Submission",
      ordinal: 4,
      description:
        "Assembling the thesis: structure, chapter drafting, coherence across papers, and the formal application for examination (GSO.3).",
      typicalTiming: { from: 9, to: 12, label: "Terms 9–12" },
      gate: { type: "submission", formRef: "GSO.3" },
      requiredDocuments: [
        {
          id: "thesis_draft",
          title: "Thesis chapters",
          description: "Chapter drafts for structural and technical feedback.",
        },
      ],
      activities: ["doc_feedback", "writing_support"],
      implemented: false,
    },
    {
      id: "final-viva",
      title: "Final Viva",
      ordinal: 5,
      description:
        "The viva voce: a defence of the thesis before an internal and an external examiner. Mock vivas here rehearse chapter-by-chapter questioning at full pressure.",
      typicalTiming: { from: 12, to: 13, label: "After submission" },
      gate: { type: "examination" },
      requiredDocuments: [
        {
          id: "thesis_final",
          title: "Submitted thesis",
          description: "The examined document.",
        },
      ],
      activities: ["mock_viva", "viva_prep"],
      implemented: false,
    },
    {
      id: "corrections",
      title: "Corrections & Completion",
      ordinal: 6,
      description:
        "Post-viva corrections (minor or major), final submission to the Examination Schools, and graduation.",
      typicalTiming: { from: 13, to: 14, label: "Post-viva" },
      gate: { type: "submission" },
      requiredDocuments: [],
      activities: ["writing_support"],
      implemented: false,
    },
  ],
};
