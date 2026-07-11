// Generic UK PhD programme template: registration → upgrade (MPhil→PhD
// transfer) → thesis → viva. Naming varies by university ("upgrade",
// "transfer", "confirmation", "first-year review") — this template uses the
// most common shape. Timings are in months from registration.
import type { ProgrammeTemplate } from "@/lib/template";

export const genericUkPhd: ProgrammeTemplate = {
  id: "generic-uk-phd",
  name: "UK PhD (generic)",
  institutionNote:
    "A typical UK PhD structure: first-year upgrade viva, thesis, final viva. Names and timings vary by university — edit target dates and statuses to match your department's rules.",
  timeUnit: "month",
  stages: [
    {
      id: "registration",
      title: "Registration & First Year",
      ordinal: 0,
      description:
        "You register (often initially for an MPhil) and scope the project: literature review, research plan, training, and first results.",
      typicalTiming: { from: 1, to: 9, label: "Months 1–9" },
      gate: { type: "none" },
      requiredDocuments: [
        {
          id: "proposal",
          title: "Research proposal",
          description: "The working plan — question, approach, and why it matters.",
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
            "Is there a clear, focused question that is answerable — and worth answering — within a PhD?",
          weight: 1,
        },
        {
          id: "significance",
          title: "Motivation & significance",
          description: "Does the document make a convincing case for why this problem matters?",
          weight: 1,
        },
        {
          id: "approach",
          title: "Proposed approach",
          description:
            "Are the planned methods and first studies appropriate, concrete, and achievable?",
          weight: 1,
        },
        {
          id: "literature",
          title: "Literature grounding",
          description: "Is prior work surveyed, fairly represented, and used to position the project?",
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
      id: "upgrade",
      title: "Upgrade to PhD",
      ordinal: 1,
      description:
        "The first formal gate: upgrade (transfer) from MPhil to PhD registration. You submit an upgrade report and defend it in a viva with two assessors who judge whether the project can reach doctoral level.",
      typicalTiming: { from: 9, to: 14, label: "Months 9–14" },
      gate: { type: "report_and_viva" },
      requiredDocuments: [
        {
          id: "upgrade_report",
          title: "Upgrade report",
          description:
            "Typically 10–20 pages: motivation, literature, methods, results to date, and the plan for the full PhD.",
        },
        {
          id: "supporting",
          title: "Supporting material (optional)",
          description: "Proposal, key papers, or drafts the assessors may draw on.",
        },
      ],
      activities: ["doc_feedback", "mock_viva", "writing_support"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "internal",
            name: "Dr Adeyemi",
            role: "Internal assessor",
            style:
              "Methodical and detail-oriented. Works through the report section by section, pressing on experimental design, controls, error analysis, and whether the stated plan is achievable in the time remaining.",
            focus: ["methodology", "results", "feasibility"],
          },
          {
            id: "independent",
            name: "Dr Kowalski",
            role: "Independent assessor",
            style:
              "Big-picture and comparative. Asks where the work sits in the field, what is genuinely new, which competing approaches exist, and whether the candidate understands the wider literature.",
            focus: ["originality", "knowledge", "writing"],
          },
        ],
        rubric: [
          {
            id: "originality",
            title: "Originality & significance",
            description:
              "Does the project promise a distinct, worthwhile contribution rather than incremental repetition?",
            weight: 1,
          },
          {
            id: "methodology",
            title: "Methodology",
            description:
              "Are the methods appropriate, rigorous, and well understood — including limitations and alternatives?",
            weight: 1,
          },
          {
            id: "results",
            title: "Progress & results to date",
            description: "Is there enough credible preliminary work to show the project is off the ground?",
            weight: 1,
          },
          {
            id: "feasibility",
            title: "Feasibility of the PhD plan",
            description:
              "Can the proposed programme realistically be completed to doctoral standard in the time available?",
            weight: 1,
          },
          {
            id: "knowledge",
            title: "Subject knowledge",
            description:
              "Does the candidate command the relevant literature and theory beyond their immediate experiments?",
            weight: 1,
          },
          {
            id: "writing",
            title: "Quality of the written report",
            description: "Is the report clearly structured, well argued, and of doctoral standard?",
            weight: 0.5,
          },
        ],
        verdicts: [
          {
            id: "upgraded",
            label: "Upgrade approved",
            description: "The candidate upgrades to full PhD registration.",
          },
          {
            id: "referred",
            label: "Referred",
            description: "Not yet ready — revise and re-apply. One further attempt is usually permitted.",
          },
          {
            id: "mphil_route",
            label: "Recommend MPhil route",
            description: "The work is better suited to completion as an MPhil.",
          },
        ],
      },
    },
    {
      id: "papers",
      title: "Papers & Rebuttals",
      ordinal: 2,
      description:
        "Ongoing throughout: writing journal/conference papers, surviving peer review, and drafting rebuttal letters. The AI plays Reviewer 2 so the real one hurts less.",
      typicalTiming: { from: 9, to: 42, label: "Recurring" },
      gate: { type: "recurring" },
      requiredDocuments: [
        { id: "manuscript", title: "Manuscript draft", description: "A paper draft for review-style feedback." },
        { id: "reviews", title: "Referee reports", description: "Reviewer comments to rebut." },
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
              "Sceptical, technically exacting, and allergic to overclaiming. Attacks the weakest link first: missing controls, unfair baselines, error bars, reproducibility, and any gap between what the abstract promises and what the data show.",
            focus: ["soundness", "novelty", "rebuttal"],
          },
          {
            id: "editor",
            name: "Dr Marchetti",
            role: "Associate editor",
            style:
              "Balanced and outcome-oriented. Weighs significance for the readership, pushes on clarity and framing, and presses the author to say precisely what revision they would make.",
            focus: ["significance", "clarity", "rebuttal"],
          },
        ],
        rubric: [
          {
            id: "novelty",
            title: "Novelty",
            description: "Is the claimed advance genuinely new against the closest prior work?",
            weight: 1,
          },
          {
            id: "soundness",
            title: "Technical soundness",
            description: "Do the methods, controls, statistics, and data support the claims as stated?",
            weight: 1,
          },
          {
            id: "significance",
            title: "Significance",
            description: "Would this result matter to the field?",
            weight: 1,
          },
          {
            id: "clarity",
            title: "Clarity & presentation",
            description: "Are the argument, figures, and framing clear enough for a busy reader to trust?",
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
            description: "The rebuttal holds up; the paper needs only small, clearly-scoped changes.",
          },
          {
            id: "major_revision",
            label: "Major revision",
            description: "The core may survive, but significant additional work is needed before acceptance.",
          },
          {
            id: "reject",
            label: "Reject",
            description: "The defence did not overcome the objections.",
          },
        ],
        session: {
          label: "Rebuttal sparring",
          reportTitle: "Referee Panel Assessment",
          brief:
            "You are role-playing the referee panel of a selective peer-reviewed journal in a live rebuttal rehearsal. The candidate (the user) is the manuscript's first author, practising their defence before writing the real response letter. The first document is the manuscript under review; any further documents are the actual referee reports. Where referee reports are provided, ground your objections in them — raise each substantive point and press until it is properly answered. Where none are provided, raise the objections a demanding but competent reviewer would.",
          opening:
            "asking the author to state, in a few sentences, the paper's central claim and why it merits publication in this journal",
        },
      },
    },
    {
      id: "thesis",
      title: "Thesis Writing & Submission",
      ordinal: 3,
      description:
        "Assembling the thesis: structure, chapter drafting, coherence across papers, and formal submission.",
      typicalTiming: { from: 30, to: 42, label: "Months 30–42" },
      gate: { type: "submission" },
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
          description: "Is the relevant work cited, fairly represented, and used to position the contribution?",
          weight: 1,
        },
        {
          id: "writing",
          title: "Prose & presentation",
          description: "Is the writing precise and readable, with figures that carry their weight?",
          weight: 0.5,
        },
      ],
    },
    {
      id: "final-viva",
      title: "Final Viva",
      ordinal: 4,
      description:
        "The viva voce: a defence of the thesis before an internal and an external examiner. Mock vivas here rehearse chapter-by-chapter questioning at full pressure.",
      typicalTiming: { from: 42, to: 45, label: "After submission" },
      gate: { type: "examination" },
      requiredDocuments: [
        { id: "thesis_final", title: "Submitted thesis", description: "The examined document." },
      ],
      activities: ["mock_viva", "viva_prep"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "internal",
            name: "Dr Nakamura",
            role: "Internal examiner",
            style:
              "Forensic and thorough. Has read every page and works through the thesis chapter by chapter: definitions, derivations, consistency, and whether each claim in the conclusions is actually established in the body.",
            focus: ["methodology", "command", "quality"],
          },
          {
            id: "external",
            name: "Prof O'Donnell",
            role: "External examiner",
            style:
              "A senior authority in the field. Opens broad — what does this thesis change about how the field thinks? — then attacks the novelty and significance of each contribution against the strongest published alternatives.",
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
              "Does the candidate demonstrate deep knowledge of the field and how the thesis sits within it?",
            weight: 1,
          },
          {
            id: "methodology",
            title: "Methodological soundness",
            description: "Are the methods rigorous and well justified, with limitations honestly treated?",
            weight: 1,
          },
          {
            id: "defence",
            title: "Quality of the defence",
            description:
              "Under sustained challenge, does the candidate defend claims with evidence and concede gracefully where criticism lands?",
            weight: 1,
          },
          {
            id: "quality",
            title: "Thesis quality",
            description: "Is the written thesis coherent, well structured, and of publishable standard?",
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
            description: "The standard good outcome — small fixes, typically within three to six months.",
          },
          {
            id: "major_corrections",
            label: "Pass with major corrections",
            description: "Substantial but well-defined revision before the degree is awarded.",
          },
          {
            id: "refer_resubmit",
            label: "Refer for resubmission",
            description: "Significant further work is required; the thesis must be revised and re-examined.",
          },
          {
            id: "mphil_award",
            label: "Recommend MPhil award",
            description: "The work does not reach doctoral standard but merits a master's-level degree.",
          },
        ],
        session: {
          label: "Mock final viva",
          reportTitle: "Final Viva Examination Report",
          brief:
            "You are role-playing BOTH examiners at a UK PhD final viva voce examination. The candidate (the user) has submitted the thesis material below and must now defend it. Examine it the way real examiners do: establish the big picture first, then work through the material systematically — contribution by contribution, chapter by chapter — testing whether the work is the candidate's own, whether it merits the degree, and whether the candidate can defend every major claim against the strongest objections in the field.",
          opening:
            "conventionally, inviting the candidate to summarise the thesis — its central argument and the contributions they consider doctoral-level — in a few minutes",
        },
      },
    },
    {
      id: "corrections",
      title: "Corrections & Completion",
      ordinal: 5,
      description:
        "Post-viva corrections (minor or major), final submission, and graduation.",
      typicalTiming: { from: 45, to: 48, label: "Post-viva" },
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
            "Is every correction the examiners required addressed explicitly — none skipped or quietly reinterpreted?",
          weight: 1,
        },
        {
          id: "responsiveness",
          title: "Substance of the responses",
          description:
            "Do the changes genuinely resolve each concern rather than deflect it, with disagreements argued respectfully?",
          weight: 1,
        },
        {
          id: "traceability",
          title: "Traceability",
          description:
            "Can an examiner verify each change quickly — precise page/section references and before/after text where helpful?",
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
