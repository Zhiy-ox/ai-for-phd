// US PhD programme template: coursework → qualifying exam → dissertation
// proposal (candidacy) → dissertation → defense. Timings are in semesters;
// committee structures vary by school — edit statuses and dates to match.
import type { ProgrammeTemplate } from "@/lib/template";

export const usPhd: ProgrammeTemplate = {
  id: "us-phd",
  name: "US PhD",
  institutionNote:
    "A typical US PhD structure: qualifying exam, candidacy (proposal defense), dissertation, and final defense. Committee composition and timing vary widely by school and department.",
  timeUnit: "semester",
  stages: [
    {
      id: "coursework",
      title: "Coursework & Rotations",
      ordinal: 0,
      description:
        "The first years: graduate coursework, lab rotations, choosing an advisor, and the first research results.",
      typicalTiming: { from: 1, to: 4, label: "Semesters 1–4" },
      gate: { type: "none" },
      requiredDocuments: [
        {
          id: "proposal",
          title: "Research plan",
          description: "An early plan for the dissertation research direction.",
        },
      ],
      activities: ["writing_support", "doc_feedback"],
      implemented: true,
      reviewRubric: [
        {
          id: "question",
          title: "Research question",
          description: "Is there a clear, focused question worth a dissertation?",
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
          description: "Are the planned methods appropriate, concrete, and achievable?",
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
      id: "quals",
      title: "Qualifying Exam",
      ordinal: 1,
      description:
        "The first gate: a written and/or oral examination of your command of the field. The committee probes breadth, depth, and whether you can reason on your feet.",
      typicalTiming: { from: 3, to: 5, label: "Semesters 3–5" },
      gate: { type: "report_and_viva" },
      requiredDocuments: [
        {
          id: "field_statement",
          title: "Field statement / exam document",
          description:
            "Whatever your programme examines on: a field survey, exam syllabus summary, or early research report.",
        },
      ],
      activities: ["doc_feedback", "mock_viva", "viva_prep"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "chair",
            name: "Prof Castillo",
            role: "Committee chair",
            style:
              "Broad and probing. Moves across the field testing whether your knowledge connects — asks how concepts relate, what the classic results actually say, and where the open problems are.",
            focus: ["breadth", "reasoning"],
          },
          {
            id: "member",
            name: "Dr Hoffman",
            role: "Committee member",
            style:
              "Deep and technical. Picks the areas closest to your research and drills down: derivations, assumptions, limiting cases, and what happens when the textbook conditions fail.",
            focus: ["depth", "communication"],
          },
        ],
        rubric: [
          {
            id: "breadth",
            title: "Breadth of knowledge",
            description: "Command of the field beyond the immediate research topic.",
            weight: 1,
          },
          {
            id: "depth",
            title: "Depth in specialty",
            description: "Rigorous understanding of the areas closest to the dissertation.",
            weight: 1,
          },
          {
            id: "reasoning",
            title: "Reasoning under pressure",
            description:
              "Can the candidate work through unfamiliar questions logically rather than reciting?",
            weight: 1,
          },
          {
            id: "communication",
            title: "Communication",
            description: "Are answers organised, precise, and honest about uncertainty?",
            weight: 0.5,
          },
        ],
        verdicts: [
          { id: "pass", label: "Pass", description: "The candidate advances." },
          {
            id: "retake",
            label: "Conditional / retake",
            description: "Specific areas must be re-examined; one retake is typically permitted.",
          },
          {
            id: "masters_route",
            label: "Recommend master's route",
            description: "The committee recommends completing with a master's degree.",
          },
        ],
        session: {
          label: "Mock qualifying exam",
          reportTitle: "Qualifying Exam Assessment",
          brief:
            "You are role-playing a US PhD qualifying-exam committee. The candidate (the user) is being examined on their command of the field. The documents below define the examinable ground; range across it the way a real committee does — connected concepts, classic results, derivations, limiting cases — and press until you find the edge of the candidate's knowledge.",
          opening:
            "asking the candidate to give a brief overview of their field and where their intended research sits within it",
        },
      },
    },
    {
      id: "candidacy",
      title: "Dissertation Proposal (Candidacy)",
      ordinal: 2,
      description:
        "The proposal defense: present the dissertation plan to your committee and defend its originality, feasibility, and significance to advance to candidacy (ABD).",
      typicalTiming: { from: 4, to: 7, label: "Semesters 4–7" },
      gate: { type: "report_and_viva" },
      requiredDocuments: [
        {
          id: "proposal_doc",
          title: "Dissertation proposal",
          description:
            "The written proposal: aims, background, preliminary results, research plan, and timeline.",
        },
      ],
      activities: ["doc_feedback", "mock_viva", "writing_support"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "chair",
            name: "Prof Castillo",
            role: "Committee chair",
            style:
              "Constructive but exacting about scope. Presses on whether the aims form one coherent dissertation, whether the timeline is honest, and what the contingency is when Aim 2 fails.",
            focus: ["feasibility", "coherence"],
          },
          {
            id: "outside",
            name: "Prof Brandt",
            role: "Outside member",
            style:
              "From a neighbouring field. Attacks significance and novelty from outside your bubble: why should anyone beyond your subfield care, and what would change if you succeed?",
            focus: ["originality", "significance"],
          },
        ],
        rubric: [
          {
            id: "originality",
            title: "Originality",
            description: "Does the proposed work promise a distinct contribution?",
            weight: 1,
          },
          {
            id: "significance",
            title: "Significance",
            description: "Why the work matters beyond the immediate subfield.",
            weight: 1,
          },
          {
            id: "feasibility",
            title: "Feasibility & plan",
            description: "Are the aims achievable with the available time, methods, and resources?",
            weight: 1,
          },
          {
            id: "coherence",
            title: "Coherence of aims",
            description: "Do the aims form one dissertation rather than three disconnected projects?",
            weight: 1,
          },
          {
            id: "writing",
            title: "Quality of the written proposal",
            description: "Is the proposal clear, well argued, and complete?",
            weight: 0.5,
          },
        ],
        verdicts: [
          {
            id: "advanced",
            label: "Advanced to candidacy",
            description: "The proposal is approved; the candidate is ABD.",
          },
          {
            id: "revise",
            label: "Revise & re-present",
            description: "The committee requires a revised proposal or plan.",
          },
          {
            id: "not_approved",
            label: "Not approved",
            description: "The proposal does not support a viable dissertation in its current form.",
          },
        ],
        session: {
          label: "Mock proposal defense",
          reportTitle: "Proposal Defense Assessment",
          brief:
            "You are role-playing a US PhD dissertation-proposal committee. The candidate (the user) is defending the proposal below to advance to candidacy. Test the aims, feasibility, timeline, and significance the way a real committee does — including the outside member's 'why should anyone care' pressure.",
          opening:
            "asking the candidate to summarise the proposed dissertation — its aims and intended contribution — in a few minutes",
        },
      },
    },
    {
      id: "papers",
      title: "Papers & Rebuttals",
      ordinal: 3,
      description:
        "Ongoing throughout: writing papers, surviving peer review, and drafting rebuttal letters. The AI plays Reviewer 2 so the real one hurts less.",
      typicalTiming: { from: 3, to: 10, label: "Recurring" },
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
          { id: "novelty", title: "Novelty", description: "Is the claimed advance genuinely new against the closest prior work?", weight: 1 },
          { id: "soundness", title: "Technical soundness", description: "Do the methods, controls, statistics, and data support the claims?", weight: 1 },
          { id: "significance", title: "Significance", description: "Would this result matter to the field?", weight: 1 },
          { id: "clarity", title: "Clarity & presentation", description: "Are the argument and figures clear enough for a busy reader to trust?", weight: 0.5 },
          {
            id: "rebuttal",
            title: "Quality of the author's defence",
            description:
              "Did the author address criticisms head-on with evidence and commit to concrete revisions?",
            weight: 1,
          },
        ],
        verdicts: [
          { id: "minor_revision", label: "Minor revision", description: "The rebuttal holds up; small changes only." },
          { id: "major_revision", label: "Major revision", description: "Significant additional work before acceptance." },
          { id: "reject", label: "Reject", description: "The defence did not overcome the objections." },
        ],
        session: {
          label: "Rebuttal sparring",
          reportTitle: "Referee Panel Assessment",
          brief:
            "You are role-playing the referee panel of a selective peer-reviewed journal in a live rebuttal rehearsal. The candidate (the user) is the manuscript's first author, practising their defence before writing the real response letter. The first document is the manuscript under review; any further documents are the actual referee reports — ground your objections in them where provided.",
          opening:
            "asking the author to state, in a few sentences, the paper's central claim and why it merits publication in this journal",
        },
      },
    },
    {
      id: "thesis",
      title: "Dissertation Writing",
      ordinal: 4,
      description:
        "Assembling the dissertation: structure, chapter drafting, and coherence across the aims and published papers.",
      typicalTiming: { from: 7, to: 10, label: "Semesters 7–10" },
      gate: { type: "submission" },
      requiredDocuments: [
        {
          id: "thesis_draft",
          title: "Dissertation chapters",
          description: "Chapter drafts for structural and technical feedback.",
        },
      ],
      activities: ["doc_feedback", "writing_support"],
      implemented: true,
      reviewRubric: [
        { id: "argument", title: "Central argument", description: "Does the chapter advance one clear argument that serves the dissertation?", weight: 1 },
        { id: "structure", title: "Structure & coherence", description: "Well organised internally and connected to neighbouring chapters?", weight: 1 },
        { id: "rigor", title: "Technical rigor", description: "Methods, derivations, and limitations treated at examination standard?", weight: 1 },
        { id: "literature", title: "Literature integration", description: "Relevant work cited, fairly represented, and used to position the contribution?", weight: 1 },
        { id: "writing", title: "Prose & presentation", description: "Precise, readable writing with figures that carry their weight?", weight: 0.5 },
      ],
    },
    {
      id: "final-viva",
      title: "Dissertation Defense",
      ordinal: 5,
      description:
        "The final defense: a public presentation and committee examination of the dissertation. Mock defenses here rehearse chapter-by-chapter questioning at full pressure.",
      typicalTiming: { from: 10, to: 11, label: "Final semester" },
      gate: { type: "examination" },
      requiredDocuments: [
        { id: "thesis_final", title: "Submitted dissertation", description: "The examined document." },
      ],
      activities: ["mock_viva", "viva_prep"],
      implemented: true,
      assessment: {
        panel: [
          {
            id: "chair",
            name: "Prof Castillo",
            role: "Committee chair",
            style:
              "Forensic and thorough. Has read every page and works through the dissertation aim by aim: methods, consistency between chapters, and whether each claim in the conclusions is established in the body.",
            focus: ["methodology", "command", "quality"],
          },
          {
            id: "external",
            name: "Prof Brandt",
            role: "Outside member",
            style:
              "Opens broad — what does this dissertation change about how the field thinks? — then attacks the novelty and significance of each contribution against the strongest published alternatives.",
            focus: ["contribution", "defence", "command"],
          },
        ],
        rubric: [
          { id: "contribution", title: "Original contribution", description: "A significant, original contribution worthy of a doctorate?", weight: 1 },
          { id: "command", title: "Command of the field", description: "Deep knowledge of the field and where the dissertation sits within it?", weight: 1 },
          { id: "methodology", title: "Methodological soundness", description: "Rigorous, well-justified methods with limitations honestly treated?", weight: 1 },
          {
            id: "defence",
            title: "Quality of the defense",
            description: "Under sustained challenge, does the candidate defend claims with evidence and concede gracefully where criticism lands?",
            weight: 1,
          },
          { id: "quality", title: "Dissertation quality", description: "Coherent, well structured, and of publishable standard?", weight: 0.5 },
        ],
        verdicts: [
          { id: "pass", label: "Pass", description: "The defense is successful; the dissertation is accepted." },
          {
            id: "minor_revisions",
            label: "Pass with revisions",
            description: "The standard outcome — revisions approved by the chair before deposit.",
          },
          {
            id: "major_revisions",
            label: "Major revisions",
            description: "Substantial revision with committee re-approval required.",
          },
          {
            id: "not_passed",
            label: "Not passed",
            description: "The defense did not succeed; re-examination is required.",
          },
        ],
        session: {
          label: "Mock defense",
          reportTitle: "Defense Examination Report",
          brief:
            "You are role-playing a US PhD dissertation-defense committee. The candidate (the user) has submitted the dissertation material below and must now defend it. Examine it the way a real committee does: establish the big picture first, then work through the material systematically — aim by aim, chapter by chapter — testing whether it merits the degree and whether the candidate can defend every major claim.",
          opening:
            "asking the candidate to summarise the dissertation — its central argument and contributions — in a few minutes",
        },
      },
    },
    {
      id: "corrections",
      title: "Revisions & Deposit",
      ordinal: 6,
      description:
        "Post-defense revisions, committee sign-off, and final deposit of the dissertation.",
      typicalTiming: { from: 11, to: 12, label: "Post-defense" },
      gate: { type: "submission" },
      requiredDocuments: [
        {
          id: "corrections_list",
          title: "Committee's revision list",
          description: "The revisions required at the defense.",
        },
        {
          id: "corrections_response",
          title: "Revisions response",
          description: "Your point-by-point account of each revision and where it was made.",
        },
      ],
      activities: ["doc_feedback", "writing_support"],
      implemented: true,
      reviewRubric: [
        { id: "completeness", title: "Coverage of the revision list", description: "Every required revision addressed explicitly — none skipped?", weight: 1 },
        { id: "responsiveness", title: "Substance of the responses", description: "Do the changes genuinely resolve each concern rather than deflect it?", weight: 1 },
        { id: "traceability", title: "Traceability", description: "Can a committee member verify each change quickly from your references?", weight: 1 },
        { id: "writing", title: "Quality of the revised text", description: "New material at the standard of the rest of the dissertation?", weight: 0.5 },
      ],
    },
  ],
};
