# Domain Model

## Overview

- <Summarize the part of the business process modeled in this context>

## Invariants

- <What must always be true?>

## Business rules

- <Observed business rule>

## Commands

### <Command Name>

- Intent: <What outcome is the actor trying to achieve?>
- Enforces: <Invariant or rule protected by this command>
- Handled By: <Aggregate or note "not yet identified">

## Policies

### <Policy Name>

- Purpose: <Why this reaction exists>
- Triggered By: <Event Name>
- Issues: <Command Name>
- Notes: <Timing, dependency, or uncertainty if relevant>

## Lifecycle

Only document lifecycle states that were explicitly discovered.

States:

- <State A> -> <State B> -> <State C>

Terminal States:

- <Terminal state>

## Aggregates

### <Aggregate Name>

- Responsibility: <What consistency boundary this aggregate protects>
- Handles Commands: 
  - <Command name>
- Produces Events:
  - <Event name>
- Protected Invariants:
  - <Invariant enforced here>

## Read models

### <Read Model Name>

Purpose: <Why does it exist>
Used By: <Name of the consumer>
Built from events:
  - <Event name>
Notes: <Important notes about timing, consistency, depedencies, etc, if relevant>
