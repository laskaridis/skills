import type {
  CalibrationResult,
  CaseDefinition,
  Control,
  RunOptions,
} from './types.ts';
import { judge } from './judging.ts';
import path from 'node:path';

export async function calibrate(
  options: RunOptions,
  runtime: string,
  runDirectory: string,
  cases: CaseDefinition[],
  controls: Control[] | null,
): Promise<CalibrationResult> {
  if (!controls) {
    return {
      status: 'unavailable',
      reason: 'This suite has no judge-tests.ts controls.',
    };
  }

  const results: NonNullable<CalibrationResult['controls']> = [];

  try {
    for (const control of controls) {
      const item = cases.find((c) => c.id === control.caseId)!;
      const inputFiles: Record<string, string> = {};
      const fs = await import('node:fs/promises');

      for (const file of item.fixtureFiles) {
        inputFiles[file] = await fs.readFile(
          path.join(item.fixtures, file),
          'utf8',
        );
      }

      console.log(`calibration: ${control.id}`);
      const result = await judge(
        options,
        runtime,
        path.join(runDirectory, 'calibration', control.id),
        item.requirements,
        {
          stage: 'calibration',
          input_files: inputFiles,
          prompt: item.prompt,
          workspace_files: { ...inputFiles, ...control.generatedFiles },
          final_response: control.finalResponse,
        },
      );

      results.push({
        id: control.id,
        case: control.caseId,
        expected: control.expected,
        judge: result,
        status:
          result.status !== 'ok'
            ? 'judge_error'
            : result.finding!.findings.every(
                  (f) => f.status === control.expected[f.id],
                )
              ? 'pass'
              : 'grader_disagreement',
      });
    }

    return {
      status: results.some((c) => c.status === 'judge_error')
        ? 'judge_error'
        : results.some((c) => c.status === 'grader_disagreement')
          ? 'grader_disagreement'
          : 'pass',
      controls: results,
    };
  } catch (error: any) {
    return {
      status: 'harness_error',
      reason: error.stack ?? error.message,
      controls: results,
    };
  }
}
