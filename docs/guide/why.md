# Why cogit

AI made writing code faster and moved the bottleneck to review. In a Harvard job-market
working paper (Chen and Stratton, 4 August 2026; not peer-reviewed) covering 718 firms and
725,938 workers, AI coding agents wrote 30% more lines of code, made 20% more commits and
opened 23% more pull requests, while resolved Jira issues and epics showed no statistically
significant gain. The paper rules out an increase larger than 12% of the baseline mean. The
review absorbed the difference: average review time rose 49%, comments per pull request 35%,
the share of pull requests with changes requested nearly doubled (0.13 to 0.25), and the share
of workers doing reviews rose 14%. Pull requests did not get larger, so size does not explain
it.

A reviewer reading a diff sees what changed, not why: the goal, the decisions, and the options
that were tried and rejected. That intent stays in the conversation with the coding agent,
where the reviewer cannot see it. The author forgets it too: three weeks later, nobody
remembers why the code went one way and not the other, and the agent starts every session
knowing nothing about the last one.

cogit keeps that intent in the record and hands it over:

- the `Thought:` trailer links each code commit to the message behind it, and
  `cogit show <sha>` opens that message
- `cogit why <file>` lists what earlier sessions decided and rejected for a file
- `cogit pr` turns a branch into a review-ready description
- the agent gets the same record at session start and before it edits a file

It does not promise a faster review; nothing has measured that yet. It gives the reviewer the
intent they would otherwise have to ask for in comments, and gives the next session the
context the last one ended with.

## Sources

- Chen & Stratton, [*Artificial Intelligence in the Firm: Bottlenecks in Software
  Production*](https://fion.ac/jellyfish.pdf) (working paper, 4 August 2026)
- [InfoQ's report](https://www.infoq.com/news/2026/10/jellyfish-ai-productivity/)
