import { TextToSpeechClient } from '@google-cloud/text-to-speech';
const client = new TextToSpeechClient();

async function listAll() {
  const [result] = await client.listVoices({});
  result.voices.forEach(v => {
    console.log(`${v.name} | ${v.ssmlGender} | ${v.languageCodes.join(',')}`);
  });
}

listAll();
