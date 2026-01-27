import axios from "axios";

async function getElevenLabsCredits() {
  try {
    const res = await axios.get("https://api.elevenlabs.io/v1/user", {
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY_1,
      },
    });

    const data = res.data;
    return {total:data.subscription.character_limit,used:data.subscription.character_count,remaining:data.subscription.character_limit - data.subscription.character_count};

  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}

export{getElevenLabsCredits}
