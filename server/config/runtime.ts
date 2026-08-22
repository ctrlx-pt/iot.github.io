/** True when running inside Netlify Functions, AWS Lambda, or similar. */
export function isServerlessRuntime(): boolean {
  return !!(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.SERVERLESS ||
    process.env.VERCEL
  );
}

export function isNetlifyRuntime(): boolean {
  return !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
