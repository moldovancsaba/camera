import { spawn } from 'node:child_process';

export interface ProcessorExecutionInput {
  jobId: string;
  personInputPath: string;
  suitInputPath: string;
  outputPath: string;
  timeoutMs: number;
}

export interface ProcessorExecutionResult {
  success: boolean;
  outputPath?: string;
  stdout?: string;
  stderr?: string;
  errorCode?: string;
  errorMessage?: string;
  transient: boolean;
  pipelineVersion: string;
  workerVersion: string;
}

const WORKER_VERSION = '1.0.0';
const PIPELINE_VERSION = '1.0.0';

function applyTemplate(
  values: ProcessorExecutionInput,
  template: string[]
): string[] {
  return template.map((item) =>
    item
      .replaceAll('{job_id}', values.jobId)
      .replaceAll('{person_input}', values.personInputPath)
      .replaceAll('{suit_input}', values.suitInputPath)
      .replaceAll('{output_path}', values.outputPath)
  );
}

export async function runTryOnProcessor(
  input: ProcessorExecutionInput,
  command: string,
  argsTemplate: string[]
): Promise<ProcessorExecutionResult> {
  if (!command.trim()) {
    return {
      success: false,
      stderr: '',
      stdout: '',
      errorCode: 'missing_processor_command',
      errorMessage: 'TRYON_PROCESSOR_COMMAND is not configured',
      transient: false,
      pipelineVersion: PIPELINE_VERSION,
      workerVersion: WORKER_VERSION,
    };
  }

  const args = applyTemplate(input, argsTemplate);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        success: false,
        stdout,
        stderr,
        errorCode: 'processor_timeout',
        errorMessage: `processor exceeded timeout ${input.timeoutMs}ms`,
        transient: true,
        pipelineVersion: PIPELINE_VERSION,
        workerVersion: WORKER_VERSION,
      });
    }, input.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stdout,
        stderr,
        errorCode: 'processor_spawn_error',
        errorMessage: error.message,
        transient: false,
        pipelineVersion: PIPELINE_VERSION,
        workerVersion: WORKER_VERSION,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          success: false,
          stdout,
          stderr,
          errorCode: `processor_exit_${code ?? 'unknown'}`,
          errorMessage: stderr.trim() || `processor exited with code ${code}`,
          transient: false,
          pipelineVersion: PIPELINE_VERSION,
          workerVersion: WORKER_VERSION,
        });
        return;
      }

      resolve({
        success: true,
        outputPath: input.outputPath,
        stdout,
        stderr,
        transient: false,
        pipelineVersion: PIPELINE_VERSION,
        workerVersion: WORKER_VERSION,
      });
    });
  });
}
