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
      implemented: true,
      reviewRubric: [
        {
          id: "question",
          title: "Research question",
          description:
            "Is there a clear, focused question that is answerable — and worth answering — within a DPhil?",
          weight: 1,
        },
        {
          id: "significance",
          title: "Motivation & significance",
          description:
            "Does the document make a convincing case for why this problem matters to the field?",
          weight: 1,
        },
        {
          id: "approach",
          title: "Proposed approach",
          description:
            "Are the planned methods and first experiments appropriate, concrete, and within reach of the available facilities?",
          weight: 1,
        },
        {
          id: "literature",
          title: "Literature grounding",
          description:
            "Is the relevant prior work surveyed, fairly represented, and used to position the project?",
          weight: 1,
        },
        {
          id: "writing",
          title: "Prose & presentation",
          description: "Is the writing clear, precise, and well organised?",
          weight: 0.5,
        },
      ],
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
      implemented: true,
      assessment: {
        panel: [
          {
            id: "internal",
            name: "Dr Okafor",
            role: "Internal assessor",
            style:
              "Completion-focused and forensic about time. Works backwards from the submission date: chapter by chapter, what exists, what is missing, and whether the remaining experiments actually fit in the terms left. Presses hard on anything labelled 'in progress'.",
            focus: ["progress", "timetable", "thesis"],
          },
          {
            id: "external",
            name: "Prof Lindqvist",
            role: "Second assessor",
            style:
              "Judges the work as a future examiner would. Asks whether the results now in hand amount to a doctoral-level contribution, how the chapters cohere into one thesis argument, and whether the candidate can defend the work against the strongest objections in the field.",
            focus: ["contribution", "knowledge", "writing"],
          },
        ],
        rubric: [
          {
            id: "progress",
            title: "Progress since transfer",
            description:
              "Has the project delivered substantial, credible results since Transfer of Status — not just activity, but outcomes?",
            weight: 1,
          },
          {
            id: "contribution",
            title: "Doctoral contribution",
            description:
              "Do the results in hand, plus the planned remainder, clearly amount to a distinct contribution worthy of a DPhil?",
            weight: 1,
          },
          {
            id: "thesis",
            title: "Thesis outline & coherence",
            description:
              "Is there a convincing chapter plan in which the pieces of work form one coherent argument?",
            weight: 1,
          },
          {
            id: "timetable",
            title: "Timetable to submission",
            description:
              "Is the plan to submission concrete, realistic, and robust to the usual slippage?",
            weight: 1,
          },
          {
            id: "knowledge",
            title: "Subject knowledge",
            description:
              "Does the candidate command the field at the depth expected of someone about to defend a thesis in it?",
            weight: 1,
          },
          {
            id: "writing",
            title: "Quality of the written report",
            description:
              "Is the confirmation report clear, well structured, and of near-thesis standard?",
            weight: 0.5,
          },
        ],
        verdicts: [
          {
            id: "confirmed",
            label: "Status confirmed",
            description: "The DPhil is on track; the candidate proceeds to submission.",
          },
          {
            id: "referred",
            label: "Referred",
            description:
              "Not yet ready — address the concerns and re-apply. One further attempt is permitted.",
          },
          {
            id: "msc_route",
            label: "Recommend MSc completion",
            description:
              "The panel recommends completing the work as a master's degree rather than a doctorate.",
          },
        ],
      },
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
      implemented: true,
      assessment: {
        panel: [
          {
            id: "reviewer2",
            name: "Reviewer 2",
            role: "Anonymous referee",
            style:
              "Sceptical, technically exacting, and allergic to overclaiming. Attacks the weakest link first: missing controls, unfair baselines, error bars, reproducibility, and any gap between what the abstract promises and what the data show. Fair in the end — but only after the author has earned it.",
            focus: ["soundness", "novelty", "rebuttal"],
          },
          {
            id: "editor",
            name: "Dr Marchetti",
            role: "Associate editor",
            style:
              "Balanced and outcome-oriented. Weighs significance for the journal's readership, pushes on clarity and framing, and tests whether the author's responses would actually satisfy the referees in writing — pressing the author to say precisely what revision they would make.",
            focus: ["significance", "clarity", "rebuttal"],
          },
        ],
        rubric: [
          {
            id: "novelty",
            title: "Novelty",
            description:
              "Is the claimed advance genuinely new against the closest prior work, and is that prior work fairly represented?",
            weight: 1,
          },
          {
            id: "soundness",
            title: "Technical soundness",
            description:
              "Do the methods, controls, statistics, and data actually support the claims as stated?",
            weight: 1,
          },
          {
            id: "significance",
            title: "Significance",
            description:
              "Would this result matter to the field — does it change what others do or believe?",
            weight: 1,
          },
          {
            id: "clarity",
            title: "Clarity & presentation",
            description:
              "Are the argument, figures, and framing clear enough for a busy reader to trust?",
            weight: 0.5,
          },
          {
            id: "rebuttal",
            title: "Quality of the author's defence",
            description:
              "Did the author address criticisms head-on with evidence, concede gracefully where warranted, and commit to concrete revisions?",
            weight: 1,
          },
        ],
        verdicts: [
          {
            id: "minor_revision",
            label: "Minor revision",
            description:
              "The rebuttal holds up; the paper needs only small, clearly-scoped changes.",
          },
          {
            id: "major_revision",
            label: "Major revision",
            description:
              "The core may survive, but significant additional work or rewriting is needed before acceptance.",
          },
          {
            id: "reject",
            label: "Reject",
            description:
              "The defence did not overcome the objections; the paper is not viable in its current form.",
          },
        ],
        session: {
          label: "Rebuttal sparring",
          reportTitle: "Referee Panel Assessment",
          brief:
            "You are role-playing the referee panel of a selective peer-reviewed optics/photonics journal in a live rebuttal rehearsal. The candidate (the user) is the manuscript's first author, practising their defence before writing the real response letter. The first document is the manuscript under review; any further documents are the actual referee reports. Where referee reports are provided, ground your objections in them — raise each substantive point and press until it is properly answered. Where none are provided, raise the objections a demanding but competent reviewer would.",
          opening:
            "asking the author to state, in a few sentences, the paper's central claim and why it merits publication in this journal",
        },
      },
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
      implemented: true,
      reviewRubric: [
        {
          id: "argument",
          title: "Central argument",
          description:
            "Does the chapter advance one clear argument that serves the thesis, with claims that follow from the evidence?",
          weight: 1,
        },
        {
          id: "structure",
          title: "Structure & coherence",
          description:
            "Is the chapter well organised internally and clearly connected to what precedes and follows it?",
          weight: 1,
        },
        {
          id: "rigor",
          title: "Technical rigor",
          description:
            "Are methods, derivations, uncertainties, and limitations treated at examination standard?",
          weight: 1,
        },
        {
          id: "literature",
          title: "Literature integration",
          description:
            "Is the relevant work cited, fairly represented, and used to position the contribution?",
          weight: 1,
        },
        {
          id: "writing",
          title: "Prose & presentation",
          description:
            "Is the writing precise and readable, with figures and tables that carry their weight?",
          weight: 0.5,
        },
      ],
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
      implemented: true,
      assessment: {
        panel: [
          {
            id: "internal",
            name: "Dr Rahimi",
            role: "Internal examiner",
            style:
              "Forensic and thorough. Has read every page and works through the thesis chapter by chapter: definitions, derivations, error analysis, consistency between chapters, and whether each claim in the conclusions is actually established in the body. Politely relentless about anything hand-waved.",
            focus: ["methodology", "command", "quality"],
          },
          {
            id: "external",
            name: "Prof Baumgartner",
            role: "External examiner",
            style:
              "A senior authority in the field. Opens broad — what does this thesis change about how the field thinks? — then attacks the novelty and significance of each contribution against the strongest published alternatives. Tests whether the candidate can defend the work as their own and knows its limits.",
            focus: ["contribution", "defence", "command"],
          },
        ],
        rubric: [
          {
            id: "contribution",
            title: "Original contribution",
            description:
              "Does the thesis make a significant, original contribution to knowledge, worthy of a doctorate?",
            weight: 1,
          },
          {
            id: "command",
            title: "Command of the field",
            description:
              "Does the candidate demonstrate deep knowledge of the field, the literature, and how the thesis sits within it?",
            weight: 1,
          },
          {
            id: "methodology",
            title: "Methodological soundness",
            description:
              "Are the methods rigorous and well justified, with limitations understood and honestly treated?",
            weight: 1,
          },
          {
            id: "defence",
            title: "Quality of the defence",
            description:
              "Under sustained challenge, does the candidate defend claims with evidence, reason clearly on their feet, and concede gracefully where the criticism lands?",
            weight: 1,
          },
          {
            id: "quality",
            title: "Thesis quality",
            description:
              "Is the written thesis coherent, well structured, and of publishable standard in its presentation?",
            weight: 0.5,
          },
        ],
        verdicts: [
          {
            id: "pass",
            label: "Pass — no corrections",
            description: "The rare clean pass: the thesis is accepted as it stands.",
          },
          {
            id: "minor_corrections",
            label: "Pass with minor corrections",
            description:
              "The standard good outcome — typographical and small substantive fixes, typically within one to six months.",
          },
          {
            id: "major_corrections",
            label: "Pass with major corrections",
            description:
              "The thesis needs substantial but well-defined revision before the degree is awarded.",
          },
          {
            id: "refer_resubmit",
            label: "Refer for resubmission",
            description:
              "Significant further work is required; the thesis must be revised and re-examined.",
          },
          {
            id: "mphil_award",
            label: "Recommend MPhil award",
            description:
              "The work does not reach doctoral standard but merits a master's-level degree.",
          },
        ],
        session: {
          label: "Mock final viva",
          reportTitle: "Final Viva Examination Report",
          brief:
            "You are role-playing BOTH examiners at a University of Oxford DPhil final viva voce examination. The candidate (the user) has submitted the thesis material below and must now defend it. Examine it the way real examiners do: establish the big picture first, then work through the material systematically — contribution by contribution, chapter by chapter — testing whether the work is the candidate's own, whether it merits the degree, and whether the candidate can defend every major claim against the strongest objections in the field.",
          opening:
            "conventionally, inviting the candidate to summarise the thesis — its central argument and the contributions they consider doctoral-level — in a few minutes",
        },
      },
    },
    {
      id: "corrections",
      title: "Corrections & Completion",
      ordinal: 6,
      description:
        "Post-viva corrections (minor or major), final submission to the Examination Schools, and graduation.",
      typicalTiming: { from: 13, to: 14, label: "Post-viva" },
      gate: { type: "submission" },
      requiredDocuments: [
        {
          id: "corrections_list",
          title: "Examiners' corrections list",
          description: "The list of required corrections from the viva report.",
        },
        {
          id: "corrections_response",
          title: "Corrections response",
          description:
            "Your point-by-point account of each correction and where it was made — what the examiners sign off on.",
        },
      ],
      activities: ["doc_feedback", "writing_support"],
      implemented: true,
      reviewRubric: [
        {
          id: "completeness",
          title: "Coverage of the corrections list",
          description:
            "Is every correction the examiners required addressed explicitly — none skipped, merged away, or quietly reinterpreted?",
          weight: 1,
        },
        {
          id: "responsiveness",
          title: "Substance of the responses",
          description:
            "Do the changes genuinely resolve each concern rather than deflect it, with disagreements argued respectfully and with evidence?",
          weight: 1,
        },
        {
          id: "traceability",
          title: "Traceability",
          description:
            "Can an examiner verify each change quickly — precise page/section references and quoted before/after text where it helps?",
          weight: 1,
        },
        {
          id: "writing",
          title: "Quality of the revised text",
          description: "Is the newly written material at the standard of the rest of the thesis?",
          weight: 0.5,
        },
      ],
    },
  ],
};
