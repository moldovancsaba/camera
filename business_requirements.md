# Seyu 2.0 – SaaS version — Business & vendor requirements

**Source**: Vendor brief to propose a dedicated product delivery team.  
**Purpose**: Baseline for product scope, delivery discipline, and vendor evaluation.  
**Note**: Section 25 ended mid-sentence in the source document; a short completion is appended in brackets for readability.

---

## Vendor brief (full text)

### Purpose

This document is intended to support the selection of a vendor for a dedicated delivery team for the Seyu 2.0 SaaS platform. It summarizes the product, expected scope, required team composition, delivery, and QA rules, and the format for vendor proposals.

The target outcome is a high-capability team that can deliver the product in close cooperation with the client, using a disciplined AWS/React/Node.js delivery model, with strong project management, mandatory pull request governance, automated and manual QA, and AI-assisted development via Cursor or Augment Code.

### 1. Project overview

Seyu is a cloud-based fan engagement and venue interaction platform designed to collect, moderate, manage, and display user-generated content during live events and campaigns.

Partners and channels can run branded activations that invite users to submit photos or videos.

Submitted media is reviewed through moderation workflows and can be published to venue screens or digital displays in near real time.

The platform combines a web-based management console, a display frontend, and a scalable backend running on AWS.

The commercial objective is to package the platform into a repeatable SaaS offering for sports clubs, event organizers, brands, and media operators.

### 2. Project objective

The selected vendor is expected to provide a dedicated delivery team capable of building and stabilizing the Seyu 2.0 SaaS platform end-to-end.

- Translate the agreed scope into a production-ready backlog and delivery plan.
- Build the core multi-tenant platform foundation, moderation capabilities, content workflows, and operator console.
- Deliver the display frontend and the supporting backend services on AWS.
- Implement strong engineering discipline with code review, automated testing, deployment control, and documentation.
- Support go-live readiness, stabilization, and structured handover.

### 3. Requested engagement model

- Dedicated squad model with named resources proposed by the vendor.
- The vendor team is expected to work as an integrated product delivery team, not as ad hoc task-based resourcing.
- Core development roles should be allocated on a stable basis throughout the project.
- The initial project horizon is approximately 6 months, with potential extension for stabilization and follow-on development.
- The working language should be English. Day-to-day collaboration should allow reliable overlap with Central European Time.
- Any replacement of key resources should require prior notice, overlap, and knowledge transfer.

### 4. Scope

#### 4.1 In scope

- Multi-tenant Partner → Channel platform structure.
- Web-based Console / Editor for campaign and content management using ReactJS.
- Channel display frontend for stadium screens, public displays, or digital signage.
- User-generated content submission and moderation workflows.
- Automated moderation support using AWS Rekognition or other Image Classification AI.
- Media storage and delivery through AWS S3.
- Serverless backend architecture using Node.js on AWS Lambda.
- API design, workflow orchestration, and asynchronous event-driven processing patterns.
- Low-operations, scalable data handling using DynamoDB.
- Stripe integration for package and add-on purchase flows.
- Infrastructure setup support, CI/CD, staging, deployment, and operational readiness.
- Automated and manual QA, release validation, and launch stabilization.

#### 4.2 Out of scope unless separately agreed

- Native mobile application development.
- 24/7 operational support or long-term managed service operation.
- Content moderation staffing is an ongoing business process outside the product tooling itself.
- Large-scale data migration from legacy third-party platforms is not allowed unless specifically defined.

### 5. Architecture and integration overview

The selected vendor is expected to work within a clearly defined product architecture and system boundary. The implementation should follow the reference architecture principles below, with refinement during discovery.

- **Key components**: React-based admin console, React-based display frontend, Node.js / AWS Lambda services, event-driven processing layer, media storage, moderation services, reporting-ready data model, and CI/CD pipeline.
- **System boundaries**: The platform covers partner and channel administration, submission, moderation, publishing, and payment-related package flows; external venue hardware and offline moderation operations are outside the core system boundary unless separately agreed.
- **Third-party integrations**: Stripe for package and add-on purchase flows; AWS Rekognition for moderation support; and any agreed-upon authentication or notification service required during detailed design.
- **Authentication and authorization model**: Role-based access for operators and administrators, with tenant-aware separation across partners and channels.
- **Media flow**: user submission → upload handling → storage in S3 → metadata and moderation state persisted → approval/rejection → publishable asset delivered to display surfaces.
- **Moderation flow**: Content enters review state, automated checks and workflow rules are applied, human review is supported when required, and only approved content can proceed to the publishing state.
- **Payment flow**: Package and add-on purchase request → Stripe transaction processing → payment status confirmation → entitlement or package activation inside the platform.
- **Event/display publishing flow**: Approved content is selected in the console, prepared for the relevant channel or campaign, and pushed to the display frontend through the agreed delivery mechanism.
- **Observability expectations**: Structured application logging, infrastructure monitoring, pipeline visibility, alerting on critical failures, and sufficient operational dashboards to support stabilization and handover.

### 6. Technical landscape

- **Frontend**: ReactJS, JavaScript / TypeScript, responsive admin console, and display-oriented frontend implementation.
- **Backend**: Node.js, API design, AWS Lambda, business workflow orchestration, content and media processing logic, asynchronous event-driven patterns.
- **AWS services**: Lambda, API Gateway, S3, DynamoDB, SQS, SNS, Rekognition, IAM, monitoring, and operational tooling as required.
- **Infrastructure / DevOps**: Terraform support, CI/CD pipelines, environment management, deployment control, access governance, and operational monitoring.
- **Data model**: NoSQL design, content lifecycle logic, moderation status handling, event-driven processing, and reporting readiness.

### 7. Delivery timeline, milestone outputs, and acceptance criteria

The ideal implementation timeline is approximately 6 months. Each phase is expected to end with a review of completed deliverables, updated backlog status, open risks, and the readiness criteria for the next phase.

| Phase | Indicative timing | Primary deliverables | Acceptance criteria | Sign-off |
| ----- | ----------------- | -------------------- | ------------------- | -------- |
| Phase 1 – Discovery and solution design | Month 1 | Scope baseline, use cases, architecture summary, UX direction, prioritized backlog, delivery plan | Key scope and architecture decisions documented; backlog created with acceptance criteria; risks and dependencies logged | Client Product Owner |
| Phase 2 – Core platform foundation | Month 2 | Tenant model, auth model, backend base, console base, storage model, environment setup, CI/CD baseline | Core foundation deployed to staging; coding standards agreed; first working vertical slice demonstrated | Client Product Owner |
| Phase 3 – Feature development | Months 3–4 | Submission workflow, moderation tools, Rekognition integration, display frontend, campaign controls, Stripe flow | Critical functional flows demonstrable in staging; required unit tests in place; defects within the agreed release threshold | Client Product Owner |
| Phase 4 – QA, stabilization, launch readiness | Months 5–6 | Regression, performance checks, bug fixing, release runbook, deployment evidence, handover pack | Release criteria met; smoke and regression results approved; operational documentation handed over | Client Product Owner |

### 8. Expected deliverables

The vendor proposal and delivery execution should align with the concrete output set below. These deliverables are mandatory unless explicitly marked as optional in a later agreed statement of work.

| Workstream | Expected deliverable | What is considered done | Primary sign-off |
| ---------- | -------------------- | ----------------------- | ---------------- |
| Architecture | Architecture documentation, system diagram, integration notes, and implementation approach | Architecture decisions documented; system boundaries agreed; major integration assumptions captured | Client Product Owner |
| Planning | Backlog, sprint plan, milestone plan, RAID log, and release plan | JIRA backlog created and prioritized; acceptance criteria present for implementation-ready items; sprint cadence established | Client Product Owner |
| Frontend | React admin console and channel display frontend | Functional flows implemented in staging; code reviewed; unit tests completed; demo accepted | Client Product Owner |
| Backend | Backend APIs, Lambda services, business workflows, and asynchronous processing | API behavior documented; deployment completed to staging; tests passing; operational logging available | Client Product Owner |
| Infrastructure | IaC / Terraform support, environment setup, CI/CD pipeline, secrets, and deployment flow | Reusable deployment process exists; staging environment is stable; release process is documented | Client Product Owner |
| Quality | Automated tests, manual QA evidence, smoke, and regression suites | Required unit test and Playwright coverage implemented; critical defects resolved or accepted; evidence recorded | Client Product Owner |
| Release | Staging and production deployment package, rollback approach, release notes | Release checklist completed; approvals recorded; smoke test passed after deployment | Client Product Owner |
| Handover | Documentation, runbooks, knowledge transfer, operational notes | Confluence pages updated; key workflows documented; handover session completed | Client Technical Owner |

### 9. Team composition and resource expectation

The vendor should propose named or clearly profiled resources that match the following target setup. Seniority matters: the project requires hands-on people who have already delivered React + Node.js + AWS serverless products in practice.

| Role | Seniority | Main responsibility | Avg. FTE | Peak FTE |
| ---- | --------- | ------------------- | -------- | -------- |
| Project Manager / Delivery Lead | Senior | Planning, coordination, sprint control, reporting, release tracking | 0.5 | 1.0 |
| Solution Architect / Technical Lead | Senior | Architecture, technical decisions, standards, design authority | 0.3 | 0.5 |
| Frontend Developer | Senior / Mid-Senior | Console / Editor and Channel UI development in ReactJS | 1.0 | 1.5 |
| Backend Developer | Senior / Mid-Senior | Node.js backend, Lambda functions, APIs, workflows, integrations | 1.0 | 1.5 |
| QA Engineer | Mid-Senior | Manual QA, regression, release validation, test scenarios | 0.5 | 1.0 |
| QA Automation Engineer | Mid-Senior | Playwright automation, smoke/regression suite setup | 0.3 | 0.5 |
| DevOps / Cloud Engineer | Mid-Senior | AWS setup, CI/CD, environments, deployment support, monitoring | 0.3 | 0.5 |
| UI / UX Designer | Mid | Wireframes, screen design, usability support | 0.2 | 0.5 |

### 10. Required technical and delivery skills

#### 10.1 Core technical capability

- Technical product delivery in SaaS or platform environments.
- Scalable web platform design and multi-tenant product thinking.
- AWS serverless solution delivery.
- API-led and event-driven architecture patterns.
- Strong code review and release discipline.

#### 10.2 Frontend

- ReactJS
- JavaScript / TypeScript
- Admin console architecture
- Responsive UI implementation
- Display-oriented frontend development

#### 10.3 Backend

- Node.js
- API design
- Serverless functions with AWS Lambda
- Workflow and business logic orchestration
- Media and content processing logic
- Asynchronous processing patterns

#### 10.4 DevOps / Cloud

- Terraform support for infrastructure-as-code
- AWS Lambda, API Gateway, S3, DynamoDB, SQS, SNS, Rekognition
- IAM and cloud security basics
- Monitoring, logging, and operational readiness
- CI/CD pipeline design and deployment governance

#### 10.5 Project management / Delivery

- JIRA for backlog, sprint, and task management
- Confluence for documentation and project knowledge management
- Agile delivery coordination
- Roadmap and milestone planning
- Cross-functional stakeholder communication
- Release planning and delivery tracking
- Risk, dependency, and scope management
- Deployment coordination and go-live readiness

#### 10.6 QA / Delivery

- Manual and automated quality assurance processes
- Pull request review and approval workflow
- Regression and end-to-end testing
- Test case definition and acceptance criteria validation
- Deployment verification and release validation
- Staging and production readiness checks
- QA automation with Playwright

### 11. Mandatory engineering and QA rules

#### 11.1 AI-assisted development

Use of Cursor or Augment Code is mandatory for coding support during implementation.

The selected tool must be used to accelerate feature delivery, refactoring, documentation, and unit test creation.

The vendor should confirm that all relevant coding resources will have access to Cursor or Augment Code.

AI-generated code remains subject to normal engineering standards, peer review, and QA validation.

#### 11.2 Unit testing

Unit tests are required for frontend components, backend services, API handlers, Lambda functions, utility modules, and content-processing logic where applicable.

Code should not be considered complete without the corresponding test coverage.

The vendor should state the proposed frontend and backend test frameworks and the expected test strategy.

#### 11.3 QA automation with Playwright

Playwright is the required automation framework for end-to-end QA coverage.

Critical user journeys should be covered by automated smoke and regression scenarios.

The initial automation scope should include the most business-critical console and workflow flows, with room to expand over time.

#### 11.4 Pull request and code review rules

All code changes must be delivered through pull requests.

No direct commits to protected production branches should be allowed.

At least one qualified reviewer's approval is required before merging; higher-risk changes may require two approvals.

Pull requests should include code review notes, evidence of testing, and any relevant documentation updates.

#### 11.5 Deployment rules

Deployments should be performed through controlled pipelines rather than manual local deployment.

Changes must be validated in staging before production release unless a formal exception is agreed.

Production deployment should require explicit approval in accordance with the agreed release process.

Every production deployment should include smoke validation and rollback readiness.

### 12. Detailed QA policy and release criteria

| Area | Requirement |
| ---- | ----------- |
| Unit test coverage | Mandatory for frontend components, backend services, API handlers, Lambda functions, utility modules, payment logic, and moderation/workflow logic that are testable. |
| Playwright scope | Mandatory for critical end-to-end journeys, including login or operator access, content submission, moderation decision path, publishing flow, and key admin operations. |
| Smoke tests | Mandatory after every deployment to staging and production, with evidence captured in the release record. |
| Regression before release | Required before every planned production release; unresolved high-severity defects must be explicitly accepted or deferred by the client. |
| Environments | At minimum: development, staging, and production. |
| Approval of test results | Vendor QA lead prepares evidence; client accepts release readiness. |
| Bug severity | At least Critical, High, Medium, Low with ownership and response expectations. |
| Exit criteria for release | No open Critical defects; High defects only by explicit client approval; smoke passed; regression completed; deployment notes and rollback prepared. |

### 13. Project governance and working model

Sprint length should be two weeks unless an alternative cadence is explicitly agreed upon.

Required ceremonies: backlog refinement, sprint planning, daily stand-up, sprint review/demo, retrospective, and release readiness review.

Backlog, sprint planning, and task tracking should be maintained in JIRA.

Requirements, architecture notes, meeting summaries, decision logs, and technical documentation should be maintained in Confluence.

Reporting cadence should be at least weekly and should include completed work, next priorities, risks, blockers, and milestone status.

Demo cadence should be at least once per sprint, with a focus on working software rather than slide-only progress reports.

An escalation path should exist across the delivery lead, technical lead, and client sponsor for schedule, quality, staffing, or scope risks.

Backlog prioritization should remain with the client-side Product Owner or nominated business owner, while the vendor team contributes estimation, sequencing, and delivery recommendations.

The vendor should nominate a project manager or delivery lead as the day-to-day coordination owner.

Deployment approval flow should be explicitly documented, including who can authorize staging and production releases.

Documentation minimums should include architecture notes, API / integration notes, runbooks, release notes, and decision logs for material implementation choices.

### 14. Environment, ownership, and access model

| Topic | Expected model |
| ----- | ---------------- |
| AWS accounts | The client is expected to provide or approve the AWS account structure unless otherwise agreed. Any vendor-managed temporary setup must be transparently documented and transferred. |
| Repositories | Source repositories should be client-owned or transferred to the client at handover. The vendor must be prepared to work in the client-selected repository platform. |
| CI/CD ownership | CI/CD definitions, pipeline scripts, and release configurations are expected to become client-owned delivery assets. |
| Working platform | The client will confirm the working platform, such as GitHub, GitLab, or Azure DevOps, before onboarding. Vendors must confirm willingness to work in the selected environment. |
| Access model | Access should use named user accounts and follow the agreed SSO, MFA, VPN, or network control requirements. Shared credentials should not be used. |
| Cursor / Augment licensing | The proposal should clarify whether the vendor provides the licenses for Cursor or Augment Code or expects the client to provide them. |
| Infrastructure changes | Material infrastructure changes should require review and approval through the agreed technical governance flow. |
| Production access | Production access should be restricted to approved roles, time-bound where possible, and fully traceable. Emergency access should be exceptional and documented. |

### 15. Security, legal, and IP basics

The vendor should be prepared to sign an NDA and standard IP / confidentiality terms before receiving sensitive access or materials.

All source code, documentation, configurations, diagrams, and other delivery outputs produced under the engagement are expected to belong to the client unless otherwise agreed in writing.

Repository ownership should rest with the client or be transferred to the client, without dependence on the vendor, at handover.

The vendor should follow secure coding standards, dependency hygiene, and basic secrets-management discipline throughout the delivery process.

Credentials, tokens, keys, and customer data must be handled in accordance with least-privilege principles and never be embedded in source control.

The vendor should comply with applicable data protection requirements and immediately report any suspected security incident or data handling issue.

Use of open-source packages should be transparent and should avoid components with problematic licensing or known high-risk vulnerabilities unless explicitly approved.

### 16. Vendor response instructions

To enable structured comparison, vendors should respond with a clear proposal format that covers the points below.

- Provide named CVs where possible. If named CVs are not yet available, provide role profiles and a timeline for confirming the proposed individuals.
- State daily rates and, if preferred, monthly rates for each proposed role.
- State availability and earliest practical start date for each role.
- Describe the onboarding timeline, expected ramp-up assumptions, and first 30-day delivery approach.
- Describe the replacement policy, notice expectations, overlap, and knowledge-transfer obligations for changing team members.
- Provide relevant references and case studies involving ReactJS, Node.js, AWS serverless delivery, moderation or media workflows, and SaaS platform work.
- Confirm experience with Cursor or Augment Code in real delivery settings, including how AI-generated code is reviewed and controlled.
- Confirm willingness to work with JIRA, Confluence, pull request approval rules, pipeline-based deployment, and mandatory unit testing.
- Highlight any assumptions, constraints, or dependencies that would materially affect price, staffing, or delivery timeline.

### 17. Post-launch expectations

The vendor should support an agreed hypercare period immediately after go-live.

The proposal should clarify the expected bug-fix period and how post-launch defects will be triaged and resolved.

Knowledge transfer to the client team should be included before final project closure.

Operational documentation, deployment notes, and support runbooks should be provided as part of handover.

If the client later transitions the product to an internal or replacement team, the vendor should support reasonable onboarding and transition activities.

### 18. Evaluation criteria

- Strength of relevant technical experience
- Quality and fit of the proposed team composition
- Demonstrated AWS serverless and React / Node.js delivery maturity
- QA and release discipline, including unit testing and Playwright automation
- Practical maturity in AI-assisted development workflows
- Commercial competitiveness and ramp-up speed
- Communication quality, transparency, and delivery ownership

### 19. Tools

#### 19.1 Development tools

Node.js; ReactJS; Git; Cursor or Augment Code; Visual Studio Code; AWS Lambda; Amazon S3; Amazon DynamoDB; AWS Rekognition or relevant AI-based image classification; Postman; CI/CD deployment pipelines.

#### 19.2 QA and code quality tools

Playwright for QA automation; unit testing frameworks for frontend and backend; pull request approval workflow; JIRA for defect tracking; staging and deployment validation; regression and smoke testing processes.

#### 19.3 Project management tools

JIRA for backlog, sprint, task, and release tracking; Confluence for documentation and project knowledge base; roadmap and milestone tracking tools within JIRA; reporting and status tracking dashboards; release planning and delivery coordination processes.

#### 19.4 Development workflow/control tools

Pull request approval process; code review workflow; branch management strategy; deployment pipelines; release approval process; change tracking and documentation in Confluence.

### 20. Proposal process and submission mechanics

Proposal deadline and submission channel. The client should confirm the final proposal deadline, submission contact, and accepted file format in the invitation or cover email. Vendors should submit a single consolidated proposal package, with role profiles or CVs and the commercial response clearly separated if needed.

Clarification process. Vendors may submit clarification questions up to a defined cut-off date. The client may choose to circulate anonymized responses to all invited vendors to support a fair and comparable bidding process.

Proposal validity. Proposals should remain valid for at least 60 calendar days unless the vendor explicitly states a different validity period.

Shortlisting and follow-up. Shortlisted vendors may be asked to present the proposed team, delivery approach, QA model, AI-assisted development workflow, and relevant references in a follow-up session or interview.

Completeness of response. Responses that omit mandatory role coverage, commercial assumptions, required technology fit, or confirmation of the engineering and QA rules may be considered incomplete and may be scored lower or excluded.

### 21. Commercial assumptions and pricing format

Commercial model. Unless otherwise agreed, proposals should be structured on a transparent time-and-materials basis with role-based day rates. Vendors may additionally propose capped time-and-materials or milestone-based commercial options, but the pricing logic and associated assumptions must be explicit.

Rate presentation. Rates should be stated by role and seniority, and vendors should clearly identify whether rates are daily, monthly, or both. Any minimum allocation assumptions, onboarding fees, or ramp-up constraints should be stated.

Tooling and license assumptions. The proposal should clarify whether Cursor or Augment Code licenses, test tooling, CI/CD tooling, and other engineering productivity licenses are included in the proposed rates or expected to be provided by the client.

Travel and expenses. Travel, accommodation, or other out-of-pocket costs should be clearly identified as included or excluded and should not be assumed without explicit client approval.

Invoicing and payment terms. The vendor should state the proposed invoicing cadence, payment terms, and any commercial dependencies that materially affect pricing or onboarding.

Rate stability. The vendor should state whether proposed rates remain fixed for the initial 6-month horizon or under what clearly defined circumstances rate changes may apply.

### 22. Client responsibilities and collaboration assumptions

Client-side product ownership. The client is expected to nominate a Product Owner or equivalent business owner to prioritize the backlog, clarify business decisions, and participate in sprint reviews, milestone sign-offs, and release-readiness discussions.

Technical and release ownership. The client is expected to nominate technical and release-side approvers for major architectural decisions, environment changes, QA acceptance, and production release authorization.

Access provisioning. To support the agreed delivery cadence, the client should provide or approve access to relevant AWS accounts, repository platforms, CI/CD environments, documentation tools, Stripe-related setup, and any required third-party services in a timely manner.

Feedback and approval turnaround. The client should aim to provide timely feedback on designs, demos, backlog clarifications, and sign-off requests within an agreed turnaround window so the delivery team is not blocked by avoidable decision latency.

Business, UX, and policy input. Where business rules, moderation policy, campaign behavior, or UX direction require client input, the client is expected to provide guidance or approval through the nominated product and stakeholder channels.

Third-party dependency coordination. Where external vendors, legal review, payment setup, venue-side dependencies, or client-managed security controls affect delivery, the client remains responsible for coordinating those dependencies unless the statement of work explicitly transfers that responsibility.

### 23. Non-functional requirements and current-state assumptions

Performance and scale assumptions. The vendor should state the main performance assumptions used in the estimation, including expected traffic bursts, media upload concurrency, content-processing throughput, and any live-event usage spikes that materially affect the architecture or staffing. These assumptions should be validated and refined during discovery.

Availability and resilience. The proposal should describe the expected approach to backup, recovery, rollback, alerting, and failure handling appropriate for a SaaS platform that may be used in campaign or event-driven conditions.

Security and auditability. The solution should support structured logs, change traceability, environment-level access control, and audit-ready operational practices appropriate for client-owned systems and customer-related data.

Browser and display support. The proposal should state supported browser assumptions for the admin console and the expected runtime or browser-environment assumptions for the channel display frontend.

Media and data assumptions. The vendor should state any assumptions about supported media types, maximum upload size, retention rules, storage lifecycle, and any content-volume factors that influence design or pricing.

Current-state baseline. Unless the client explicitly confirms otherwise, vendors should clearly state whether their estimate assumes primarily greenfield delivery, partial reuse of existing code or designs, or a structured discovery phase to assess reusable assets.

Existing asset assessment. If current code, designs, AWS environments, CI/CD assets, or a partial Stripe setup already exist, the vendor should assess their quality and potential for reuse during discovery and explain any impact on the timeline, commercial assumptions, or team composition.

### 24. Hypercare and staffing continuity commitments

Hypercare period. The proposal should include a defined hypercare window after go-live, with a recommended baseline of 2–4 weeks unless the vendor proposes a stronger model. The proposal should state working hours, response expectations, ownership of triage, and how production issues will be coordinated with the client.

Post-launch defect handling. The vendor should explain which post-launch defects are included in the base engagement, how severity-based prioritization will be applied, and how fixes, validations, and redeployments will be handled during hypercare.

Staffing continuity. Key delivery roles are expected to remain stable throughout the core project lifecycle. Any planned rotation, shared allocation, or known availability limitation should be disclosed in the proposal.

Absence and vacation coverage. The proposal should explain how absences are covered without losing momentum or undocumented knowledge, including the use of overlap, secondary ownership, and current documentation.

Dedicated allocation expectations. For roles presented as dedicated, vendors should disclose any material parallel commitments and confirm that Seyu will remain the primary allocation for the core delivery team.

Transition support. If the client later transitions the product to an internal or replacement team, the vendor should provide reasonable overlap, documentation, and structured handover support.

### 25. Conclusion

This brief intends to identify a delivery partner capable of fielding a disciplined, hands-on team for Seyu 2.0. The preferred vendor will combine strong AWS / React / Node.js implementation capability with a reliable project *[source text ended here; complete per client final RFP if available]*.

---

## Solution audit: this repository vs Seyu 2.0 requirements

**Audited artifact**: This workspace (**Frame-It-Now / “Camera”** — Next.js photo frame PWA, v2.9.0 per `package.json`).  
**Audit date**: 2026-04-08.  
**Method**: Static review of repository structure, dependencies, documented architecture (`README.md`, `ARCHITECTURE.md`, `TECH_STACK.md`), and representative API/data models (`lib/db/schemas.ts`, `docs/AUTHORIZATION.md`). Process-only requirements (JIRA, Confluence, named vendor squad, commercial terms) are marked **process / outside repo**.

### Summary verdict

This codebase is a **strong partial fit** as a **fan engagement capture + admin + slideshow display** product on **Node.js + React (Next.js)**, with **partner/event tenancy** and **RBAC**. It is **not** aligned with the Seyu brief’s **target AWS serverless reference stack** (Lambda, API Gateway, S3, DynamoDB, SQS/SNS, Rekognition, Terraform), **payment**, or **full moderation/publish lifecycle** as specified. It can serve as a **reuse candidate** for discovery (per brief §23) but would require **substantial architecture and feature work** to meet the stated SaaS 2.0 brief.

### Requirement mapping

| Requirement area | Seyu brief expectation | Observed in this repo | Assessment |
| ---------------- | ---------------------- | --------------------- | ---------- |
| Multi-tenant structure | Partner → **Channel** | Partner → **Event** (plus frames, logos, slideshows) | **Partial** — similar hierarchy; “channel” as first-class entity not modeled |
| Admin console (React) | Dedicated console/editor | Next.js **App Router** admin UI + APIs in same app | **Met** (React/TS); not a separate deployable console package |
| Display / signage frontend | Channel display for venues | **`/slideshow/[slideshowId]`** playlist player; capture/share flows | **Partial** — display exists; not clearly separated as standalone signage app |
| UGC submission | Photos/videos; upload pipeline | **Photo-focused** capture + `POST /api/submissions`; **imgbb** upload | **Partial** — video workflow not evident; storage not S3 |
| Moderation workflow | Review → approve/reject → publish | **SubmissionStatus**: processing / completed / failed / deleted; admin user deactivate hides content | **Major gap** — no Rekognition/human moderation state machine or publish gate |
| Automated moderation | AWS Rekognition or equivalent | **Not present** | **Gap** |
| Media on S3 | S3 storage and delivery | **imgbb.com** URLs | **Gap** vs brief |
| Backend on Lambda | Node on AWS Lambda | **Next.js API routes** on **Vercel** (serverless functions, not the prescribed AWS stack) | **Architectural mismatch** — Node/serverless concept only |
| DynamoDB | Primary operational store | **MongoDB Atlas** | **Gap** vs brief |
| Event-driven (SQS/SNS) | Async orchestration | **Primarily synchronous** request/response APIs | **Gap** |
| Stripe | Packages/add-ons | **Not integrated** | **Gap** |
| Terraform / IaC | Terraform support | **No Terraform** in repository | **Gap** (may exist only in hosting UI) |
| CI/CD | Pipeline-based deploy, env separation | **Vercel**-style deploy implied; **no `.github/workflows`** found in repo | **Unknown / partial** — define pipelines explicitly for Seyu compliance |
| Unit tests (mandatory) | Jest/Vitest/etc. for FE/BE | **`package.json`** has build/lint/type-check only; **no unit test script** | **Gap** |
| Playwright (mandatory E2E) | Critical journeys automated | **Not** a direct dependency in `package.json` (transitive reference possible in lockfile only) | **Gap** |
| PR governance / reviews | Protected branches, approvals | **Not verifiable** from application code | **Process** — must be enforced in Git host |
| Observability | Structured logs, monitoring, dashboards | **Standard** server logging patterns; no evidence of centralized APM/dashboards in repo | **Partial** |
| AuthZ tenant-aware | RBAC, partner/channel separation | **SSO OAuth2/OIDC**; **`session.appRole`** for admin; data scoped by **partnerId/eventId** | **Partial** — strong app RBAC; “channel” tenancy not explicit |
| AI-assisted dev (Cursor/Augment) | Mandatory for vendor | **N/A** in codebase | **Process** |
| JIRA / Confluence | Backlog and docs | **N/A** in codebase | **Process** |
| Stripe + payment flows | In scope | Absent | **Gap** |
| Reporting-ready model | Reporting readiness | Rich **MongoDB** schemas; no separate analytics pipeline described | **Partial** |

### Strengths relative to the brief

- **React + TypeScript** admin and participant experiences with documented **authorization** model (`docs/AUTHORIZATION.md`).
- **Multi-entity product model** (partners, events, frames, submissions, slideshows) aligned with **operator-managed campaigns**.
- **Near–real-time display** direction via slideshow playlists and play-count fairness (`README.md`, `lib/slideshow/`).
- **Node.js** server-side logic and **API design** patterns (`lib/api/`, route handlers).
- **Operational documentation** present (architecture, stack, authorization), supporting **handover** style expectations at a product level.

### Gaps to close for Seyu 2.0 alignment (priority themes)

1. **Platform architecture**: Move or mirror target stack (**S3, Lambda, API Gateway, DynamoDB, queues**) or formally document an **approved deviation** and migration path.
2. **Moderation**: Implement **review states**, **automated classification** (e.g. Rekognition), **human queue**, and **publish-only-when-approved** linkage to display.
3. **Commerce**: **Stripe** entitlements and package/add-on flows.
4. **Quality bar**: Add **unit test** tooling and CI; add **Playwright** for login, submit, moderation, publish, and critical admin paths.
5. **IaC & environments**: **Terraform** (or agreed equivalent) and explicit **dev/staging/prod** with documented **release/smoke/regression** evidence.
6. **Terminology / domain model**: Decide mapping **Event ↔ Channel** (or introduce channels) so tenancy matches the brief.

### Suggested next step

Treat this repository as **current-state input** to **Phase 1 (Discovery)** in the brief: document **reuse vs greenfield**, estimate migration effort from **MongoDB/imgbb/Vercel** to the **reference AWS serverless** model, and produce an **architecture decision record** for any retained components.

---

## Functionality comparison: Camera app today vs Seyu 2.0 brief

**Legend**: **Full** = matches the brief’s intent; **Partial** = overlapping but narrower or different behavior; **None** = not implemented; **Process** = delivery/governance, not product code.

### 1. Organization, tenancy, and access

| Capability (brief) | Seyu expectation | Camera today | Match |
| -------------------- | ---------------- | ------------ | ----- |
| Multi-tenant hierarchy | Partner → **Channel** | Partner → **Event** (frames, logos, slideshows hang off events/partners) | **Partial** — same “operator org + activations” idea; no first-class **channel** entity |
| Tenant-aware admin | Operators see/manage their scope | Admins use app-wide admin; data filtered by partner/event in APIs and UI where applicable | **Partial** — strong **admin vs user**; not a full multi-tenant SaaS isolation model per partner |
| RBAC | Roles for operators and administrators | **SSO** + **`session.appRole`** (`admin`, `superadmin`, `user`, …); documented in `docs/AUTHORIZATION.md` | **Full** for app roles; **Partial** vs “channel-scoped operator” roles |
| Authentication | Agreed IdP / notification services | **OAuth2/OIDC + PKCE** to external SSO; session cookie | **Partial** — auth works; **no** product-owned email/notification stack in scope of brief integrations |

### 2. Campaigns, branding, and content configuration

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Console / editor for campaigns | Configure activations, content, publishing | **Admin**: partners, events, frames, logos, slideshows, submissions, users | **Partial** — rich **event** builder (custom pages, frames, logos); not labeled “campaign/channel” |
| Branded activations | Channels run branded experiences | Per-event **frames**, **logos**, **brand colors**, **custom page flows** (who-are-you, accept, CTA, take-photo) | **Full** for branded photo activations |
| Package / add-on entitlements | Stripe drives what a tenant can use | **None** — no plans, entitlements, or feature gating by purchase | **None** |

### 3. User-generated content: capture and submission

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Invite users to submit **photos or videos** | Both media types in scope | **Photos** (camera stream → canvas JPEG, or **file upload** as image). **Video** only as camera **preview** for still capture, not video file pipeline | **Partial** — **photo-first**; no video **submission** workflow |
| Upload handling | Durable upload, metadata | **POST `/api/submissions`** → **imgbb**; MongoDB document with URLs, consents, `userInfo`, event/partner context | **Full** for still images via current stack; **Partial** vs S3 + moderation metadata model |
| Submission lifecycle (technical) | Processing states | **`SubmissionStatus`**: processing / completed / failed / deleted (composition/upload pipeline) | **Partial** — technical pipeline only, **not** moderation/publish states |

### 4. Moderation and compliance

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Moderation **workflow** | Pending review → rules / human → approve or reject → only approved publishable | **No** review queue or approve/reject. **Admin archive** (`isArchived`) hides from active views; **restore** available. **User/account** deactivate hides pseudo-user content (see docs) | **Partial** — **hide/remove** tooling only, not Seyu-style **moderation + publish gate** |
| Automated moderation | **Rekognition** (or equivalent) | **None** | **None** |
| Human review tooling | Queue, decisions, audit | **None** dedicated; admins browse submissions and archive/delete | **Partial** — operational workaround only |
| GDPR / consent capture | Audit trail for activations | Per-submission **`consents`** and **`userInfo`** with timestamps | **Full** relative to brief’s need for traceability on submissions |

### 5. Publishing and venue / display

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Display / signage frontend | Channel UI for stadiums / public screens | **`/slideshow/[slideshowId]`** — playlist, layouts, play-count fairness (`lib/slideshow/`, playlist APIs) | **Full** for **web-based** slideshow display; **Partial** if brief assumes a **separate** deployable signage app |
| Push approved content to display | Console selects what is published; only approved flows to surfaces | Slideshow **playlist is driven by server rules** (submissions in scope); **not** tied to an **explicit “approved for display”** moderation outcome | **Partial** — **near real-time rotation** exists; **missing** approval-linked publishing model |
| Share / social surfaces | Secondary surfaces | **`/share/[id]`** (OG tags, public link) | **Full** for share links (not in brief table but aligned with “display” broadly) |

### 6. Commerce and monetization

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Stripe: packages & add-ons | Purchase → confirm → **entitlement / activation** in platform | **None** | **None** |
| SaaS packaging | Repeatable offering for clubs/brands | Single product deployment; **no** self-serve signup, billing, or plan tiers in app | **None** |

### 7. Platform, integrations, and operations (product-facing)

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Media storage & CDN | **S3** (+ CloudFront-style delivery) | **imgbb** URLs | **None** vs brief; **Full** as “hosted media URLs” in abstract |
| Serverless Node APIs | **Lambda** + API Gateway | **Next.js Route Handlers** (e.g. Vercel serverless) | **Partial** — same **pattern**, different **platform** |
| Data store | **DynamoDB** | **MongoDB** | **None** vs brief datastore |
| Async / event-driven workflows | **SQS/SNS**, orchestration | Mostly **synchronous** HTTP; **Upstash** rate limiting | **Partial** — minor async patterns; **not** event backbone |
| Observability | Structured logs, monitoring, dashboards | Application logging; **no** built-in dashboards/APM in repo | **Partial** |
| IaC & CI/CD as deliverables | Terraform, documented pipelines | Hosting-oriented; **no Terraform** in repo; workflows not defined in-repo | **Partial / unknown** |

### 8. Quality engineering (as product evidence)

| Capability (brief) | Seyu expectation | Camera today | Match |
| ------------------ | ---------------- | ------------ | ----- |
| Unit tests (required for completion) | FE components, APIs, Lambdas, utils | **Lint + `tsc --noEmit`**; **no** test runner in `package.json` | **None** |
| Playwright E2E | Login, submit, **moderation path**, publish, admin | **Not** configured as first-class dependency | **None** |
| Smoke / regression evidence | Per release | **Process** — not represented in codebase | **Process** |

### 9. One-line snapshot

| Area | Camera | Seyu brief |
| ---- | ------ | ----------- |
| **Hero strength** | Branded **photo** capture, **event** configuration, **slideshow** display, **SSO** admin | **Photo/video** UGC, **moderation + AI**, **S3/Lambda/DynamoDB**, **Stripe** SaaS, **channel** tenancy |
| **Largest functional gaps** | No **video** submissions, no **moderation/approve** pipeline, no **Stripe/entitlements** | — |
| **Largest platform gaps** | **imgbb + MongoDB + Vercel** vs **S3 + DynamoDB + Lambda** + queues | — |

Use this section together with **Solution audit** above: the audit stresses **architecture and compliance with the reference stack**; this section stresses **what users and operators can actually do** in the app versus what the brief describes.
