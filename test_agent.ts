import { runAgent } from './src/agent';

async function test() {
  const response = await runAgent('List files in the current directory');
  console.log('Agent Response:', response);
}

test();
