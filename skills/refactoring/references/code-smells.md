# Refactoring 

This guide includes criteria that help you discover code that needs improvement and hints on how to improve it. Consider all the following conditions below as potential design problems.

Refactor only if the resulting code would be simpler, more straightforward and more succinct. Ensure correctness first, then simplicity, readability and clarity next.

## Dupicated code

### How to spot it

Look for identical code or code which is outwardly different yet serves the same intent and produces the same outcome.

###  How to fix it

Consider the following refactorings depending on the situation:

1. Form template method:

When to apply this: When two methods in subclasdes perform similar steps in the same order, yet the steps are different.

How to apply it: Generalise the methods by extracting their steps ito methods with identical signatures, then pull up the generalized methods to form a Template Method.

2. Introduce polymorphic creation with factory methods:

When to apply this: Classses in a hierarchy implement a method similarly except for an object cretion step.

How to apply it: Make a single superclass version of the method that calls a Factory Method to handle the instantiation.

3. Chain constructors:

When to apply this: You have multiple constuructors that contain duplicate code.

How to apply it: Chain constructors together to obtain the least amount of duplicated code. Important: first, try to resolve duplication by using default constructor arguments if possible in the programming language.

4. Extract composite:

When to apply this: Sublasses in a hierarchy implement the same Composite.

How to apply it: Extract a superclass that implements the Composite.

5. Unify interfaces with adapter:

When to apply this: Clients interact with two classes, one of which has a preferred interface.

How to apply it: Unify the interfaces with an Adapter.

## Long method

**How to spot it:** 

**How to fix it:**

## Conditional complexity

**How to spot it:** 

**How to fix it:**

## Primitive obsession

**How to spot it:** 

**How to fix it:**

## Indecent exposure

**How to spot it:** 

**How to fix it:**

## Solution sprawl

**How to spot it:** 

**How to fix it:**

## Alternative classes with diferent interfaces

**How to spot it:** 

**How to fix it:**

## Lazy class

**How to spot it:** 

**How to fix it:**

## Large class

**How to spot it:** 

**How to fix it:**

## Switch statements

**How to spot it:** 

**How to fix it:**

## Combinatorial explosion

**How to spot it:** 

**How to fix it:**

## Oddball solution

**How to spot it:** 

**How to fix it:**