import {escapeXml} from './escapeXml.js'

// Example SSML builder for a "newscaster" tone. Create presets as you like.
function buildSSML(text, tone = "newscaster") {
  // Keep content short per Polly limits — chunk if > allowed
  if (tone === "newscaster") {
    return `<speak><prosody rate="95%" pitch="medium">${escapeXml(text)}</prosody></speak>`;
  } else if (tone === "calm") {
    return `<speak><prosody rate="85%" pitch="-2st">${escapeXml(text)}</prosody></speak>`;
  } else {
    return `<speak>${escapeXml(text)}</speak>`;
  }
}

export default buildSSML;