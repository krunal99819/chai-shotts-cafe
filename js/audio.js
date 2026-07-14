// ==========================================================================
// SYNTHETIC AUDIO NOTIFICATIONS (Web Audio API)
// ==========================================================================

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export const soundEffects = {
    // 1. Double Bell Chime for Orders (Warm, pleasant)
    playOrder() {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        // First chime
        playTone(ctx, 523.25, 0.4, now); // C5
        // Second chime, slightly delayed and higher pitch
        playTone(ctx, 659.25, 0.5, now + 0.15); // E5
    },

    // 2. High-Pitched Service Bell for Waiter Request
    playWaiter() {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        // A ringing table bell (modulating high pitch)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now); // A5
        osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        osc1.frequency.setValueAtTime(1200, now + 0.05);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1210, now);
        
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.2);
        osc2.stop(now + 1.2);
    },

    // 3. Cash Register Bell for Bill Request
    playBill() {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        // Part 1: Noise burst (drawer opening)
        const bufferSize = ctx.sampleRate * 0.1; // 100ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;
        
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.15, now);
        noiseGain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        // Part 2: High metallic ring (bell)
        const bellOsc = ctx.createOscillator();
        const bellGain = ctx.createGain();
        
        bellOsc.type = 'sine';
        bellOsc.frequency.setValueAtTime(1760, now + 0.05); // A6
        
        bellGain.gain.setValueAtTime(0, now);
        bellGain.gain.setValueAtTime(0.25, now + 0.05);
        bellGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        
        bellOsc.connect(bellGain);
        bellGain.connect(ctx.destination);
        bellOsc.start(now + 0.05);
        bellOsc.stop(now + 1.0);
    },

    // 4. Ascending Major Chimes for Success Payment
    playPayment() {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        // Ascending major arpeggio
        playTone(ctx, 261.63, 0.3, now);       // C4
        playTone(ctx, 329.63, 0.3, now + 0.1); // E4
        playTone(ctx, 392.00, 0.3, now + 0.2); // G4
        playTone(ctx, 523.25, 0.4, now + 0.3); // C5
        playTone(ctx, 659.25, 0.5, now + 0.4); // E5 (Sustained)
    }
};

// Generic single tone helper
function playTone(ctx, freq, duration, startTime) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    
    gainNode.gain.setValueAtTime(0.2, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
}
export default soundEffects;
