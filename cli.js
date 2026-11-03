#!/usr/bin/env node
/**
 * Command-Line Interactive Interface for National Industries (Namibind) ChatBot
 * Run: node cli.js
 */

const readline = require('readline');
const ChatbotEngine = require('./chatbot_engine');

const engine = new ChatbotEngine(__dirname);
const sessionId = 'cli_session_' + Date.now();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n================================================================');
console.log('🤖 National Industries (Namibind) AI Sales Assistant — CLI Mode');
console.log('🏢 Manufacturer & Exporter of Office Automation Machinery');
console.log('🌐 Website: https://www.namibind.co.in/ | 📞 Phone: 7942534248');
console.log('⚖️ Guardrails Active: Indicative pricing only | No final shipping/stock promises');
console.log('================================================================\n');

async function promptBot(userMessage = '') {
  const res = await engine.processMessage(sessionId, userMessage);

  console.log(`\n🤖 Namibind Assistant:`);
  console.log(res.text);

  if (res.chips && res.chips.length > 0) {
    console.log(`\n💡 Suggested Options: [ ${res.chips.join(' | ')} ]`);
  }

  if (res.guardrailsTriggered && res.guardrailsTriggered.length > 0) {
    console.log(`🛡️ Guardrail: ${res.guardrailsTriggered[0]}`);
  }

  if (res.stage === 'QUALIFIED') {
    console.log(`\n✅ LEAD QUALIFIED! Ready for escalation to Ashok Chowdhury & Sales Desk.`);
  }

  askNext();
}

function askNext() {
  rl.question('\n👤 You (or type "exit" to quit, "reset" for new inquiry): ', async (answer) => {
    const input = answer.trim();
    if (input.toLowerCase() === 'exit') {
      console.log('Exiting chat. Thank you for connecting with National Industries!');
      rl.close();
      return;
    }
    if (input.toLowerCase() === 'reset') {
      engine.resetSession(sessionId);
      console.log('--- Session reset ---');
      promptBot('');
      return;
    }
    await promptBot(input);
  });
}

// Start with greeting
promptBot('');

