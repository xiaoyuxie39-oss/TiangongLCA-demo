# Build an LCA tool in an afternoon — before you come

Seoul National University · Hands-on workshop hosted by Sangwon Suh · October 2026 · Xiaoyu Xie · 2.5 hours

## What the workshop is about

Every LCA result comes from a matrix calculation, but most LCA software hides it. In this workshop, an AI coding agent
builds a small, transparent LCA calculator live, on open data from TianGong. We then use it, and check it, on a real
case from Korea: two ways to clean up contaminated soil.

## Why it matters

- **LCA software is often a black box.** You get a number without seeing the calculation or the data choices behind it.
- **Open data lets you look inside.** TianGong publishes more than 4,000 processes that anyone can read, trace and question.
- **AI agents change who can build tools.** An agent can write a working calculator in minutes; someone still has to
  judge whether it is right.

## What you will take away

- **Read the matrix behind an LCA result:** what a column of the technology matrix means, and how three matrix steps
  turn a functional unit into impact scores.
- **Work with open data:** find a TianGong process, read its inputs and outputs, link it into a model, and name what
  you could not link.
- **Judge an AI-built tool:** test it against known results, and find the data choices it made for you that you would change.

> **Nothing to prepare, and no coding needed.**\
> If you have five minutes, three steps will help you start faster:

1. **Bring a laptop**, charged. A phone works too, but the tables are easier to read on a laptop.
2. **Open the tool once:** [xiaoyuxie39-oss.github.io/TiangongLCA-demo](https://xiaoyuxie39-oss.github.io/TiangongLCA-demo/).
   If the page says "Solved both systems", your device is ready. If not, tell us when you arrive.
3. **Pick a track** by what is already on your laptop. All three use the same tool and the same worksheet;
   there is no need to install or buy anything.
   - **Track A · build it:** you already use Codex or Claude Code.\
     At home: clone [github.com/xiaoyuxie39-oss/TiangongLCA-demo](https://github.com/xiaoyuxie39-oss/TiangongLCA-demo)
     and check that your agent is logged in and that `node --version` shows 20 or higher. On the day: run `git pull`.
   - **Track B · question it:** you use a chat AI (ChatGPT, Claude, Gemini or similar).\
     Check that you can log in on your laptop or phone.
   - **Track C · just use it:** a browser is enough.
