import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { sendMessageToGemini, generateTTS } from '../services/geminiService';
import { Send, Paperclip, Loader2, ShieldCheck, X, FileText, Mic, Square, Volume2, VolumeX, Sparkles, Calendar, CheckCircle2, MapPin, Keyboard, Mic2, Languages, RefreshCcw, Trash2 } from 'lucide-react';

interface ResidentViewProps {
  onCompleteSession: (messages: Message[]) => void;
  userName: string;
  mpName: string;
  constituency: string;
  division?: string;
  branchLocation?: string;
  mpsSchedule?: string;
}

// Audio Decoding Helpers for Gemini's raw PCM data
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Helper to calculate actual next date from schedule string ---
function getNextSessionDate(schedule?: string): string {
    if (!schedule) return "Next Session";

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    
    // Simple parser for "Every Monday..."
    const targetDayIndex = days.findIndex(d => schedule.includes(d));
    
    if (targetDayIndex === -1) return "Next Scheduled Session";

    const currentDayIndex = today.getDay();
    let daysUntil = targetDayIndex - currentDayIndex;
    
    if (daysUntil <= 0) {
        daysUntil += 7; // Move to next week if today is same day (assuming evening sessions passed) or past day
    }

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    
    // Extract time if available
    const timeMatch = schedule.match(/(\d{1,2}(?:\.\d{2})?\s?(?:AM|PM))/i);
    const timeStr = timeMatch ? `, ${timeMatch[0]}` : '';

    return `${nextDate.toLocaleDateString('en-SG', options)}${timeStr}`;
}

// --- WEB SPEECH API TYPE DEFINITION ---
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const DICTATION_LANGUAGES = [
    { code: 'en-SG', label: 'English', short: 'EN' },
    { code: 'zh-SG', label: 'Mandarin (中文)', short: '中' },
    { code: 'ms-SG', label: 'Malay (Bahasa)', short: 'MS' },
    { code: 'ta-SG', label: 'Tamil (தமிழ்)', short: 'TA' },
];

const ResidentView: React.FC<ResidentViewProps> = ({ 
    onCompleteSession, 
    userName, 
    mpName, 
    constituency, 
    division, 
    branchLocation, 
    mpsSchedule 
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      content: `Hello ${userName}, I am the Digital Assistant for ${mpName}. I can understand English, Mandarin, Malay, Tamil, and Singlish. You can speak naturally to me.`,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null); // New state for review
  
  // Input Mode & Dictation State
  const [inputMode, setInputMode] = useState<'audio' | 'dictation'>('audio'); // 'audio' (Gemini) or 'dictation' (Web Speech)
  const [dictationLang, setDictationLang] = useState('en-SG');
  const [isDictating, setIsDictating] = useState(false);

  // Urgent Booking State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [nextSessionDisplay, setNextSessionDisplay] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null); // For Web Speech API
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize next session date on load
  useEffect(() => {
      setNextSessionDisplay(getNextSessionDate(mpsSchedule));
  }, [mpsSchedule]);

  // --- GEMINI HIGH-QUALITY TTS PLAYER ---
  const playAudioResponse = async (base64Audio: string) => {
      try {
          if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          }
          
          if (audioContextRef.current.state === 'suspended') {
              await audioContextRef.current.resume();
          }

          const audioBytes = decode(base64Audio);
          // Gemini TTS returns raw PCM at 24kHz
          const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
          
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.start(0);
      } catch (e) {
          console.error("Audio Playback Failed", e);
      }
  };

  // --- MODE 1: MEDIA RECORDER (GEMINI AUDIO ANALYSIS) ---
  const startRecording = async () => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert("Microphone requires HTTPS.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Detect supported MIME type
        // Use higher bitrate (128kbps) for better clarity
        let options: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options.mimeType = 'audio/mp4';
        }
        
        const mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.start();
        setIsRecording(true);
    } catch (err) {
        console.error("Mic Error:", err);
        alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecordingForReview = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
        // Safety cleanup
        setIsRecording(false);
        return; 
    }

    // Update UI immediately
    setIsRecording(false);
    setIsEncoding(true);

    recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            setIsEncoding(false); // Done encoding
            setRecordedAudio(base64Audio); // Store for review instead of sending
        };
        
        // CRITICAL: Cleanup tracks to release mic explicitly
        recorder.stream.getTracks().forEach(track => track.stop());
    };

    try {
        recorder.stop();
    } catch (e) {
        console.error("Error stopping recorder:", e);
        setIsEncoding(false);
        setIsRecording(false);
    }
  };

  // --- MODE 2: WEB SPEECH API (DICTATION) ---
  const startDictation = () => {
      const win = window as unknown as IWindow;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechRecognition) {
          alert("Dictation not supported in this browser. Please use Chrome/Safari or switch to 'Voice Msg' mode.");
          return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = dictationLang;
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
          setIsDictating(true);
      };

      recognition.onresult = (event: any) => {
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                  finalTranscript += event.results[i][0].transcript + ' ';
              }
          }

          if (finalTranscript) {
              setInputText(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
          }
      };

      recognition.onerror = (event: any) => {
          console.error("Dictation error", event.error);
          setIsDictating(false);
      };

      recognition.onend = () => {
          setIsDictating(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
  };

  const stopDictation = () => {
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          setIsDictating(false);
      }
  };

  // --- MAIN TOGGLE ---
  const handleMicClick = () => {
      if (inputMode === 'audio') {
          if (isRecording) {
              stopRecordingForReview();
          } else {
              startRecording();
          }
      } else {
          // Dictation
          if (isDictating) {
              stopDictation();
          } else {
              startDictation();
          }
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onloadend = () => { setFile(reader.result as string); };
        reader.readAsDataURL(selectedFile);
    }
  };

  const handleSend = async (audioBase64?: string) => {
    // If just text/image check
    if (!audioBase64 && (!inputText.trim() && !file)) return;
    if (isProcessing) return;

    // Consolidate attachments (Images + Audio) to ensure History captures the Voice Data
    const attachments = [];
    if (file) attachments.push(file);
    if (audioBase64) attachments.push(audioBase64);

    // Add User Message to UI
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: audioBase64 ? "🎤 [Voice Message Sent]" : inputText,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? attachments : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setFile(null);
    setIsProcessing(true);
    
    try {
      // 1. Get Text Response
      let responseText = await sendMessageToGemini(
          messages, 
          audioBase64 ? "" : inputText + (file ? " [Image Attached]" : ""), 
          mpName,
          constituency,
          division,
          file ? [file] : undefined,
          audioBase64 // Pass audio directly for this turn
      );

      // --- DETECT URGENCY TAG ---
      if (responseText.includes("||URGENT_BOOKING||")) {
          setShowBookingModal(true);
          // Strip the tag so the user doesn't see it
          responseText = responseText.replace("||URGENT_BOOKING||", "").trim();
      }
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMsg]);
      setIsProcessing(false);

      // 2. Generate and Play Audio (if enabled)
      if (isTTSActive) {
          setIsGeneratingVoice(true);
          const ttsAudio = await generateTTS(responseText);
          if (ttsAudio) {
              await playAudioResponse(ttsAudio);
          }
          setIsGeneratingVoice(false);
      }

    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      setIsGeneratingVoice(false);
    }
  };

  const handleConfirmBooking = () => {
      setBookingConfirmed(true);
      setTimeout(() => {
          setShowBookingModal(false);
          setBookingConfirmed(false);
          // Add system message
          const confirmMsg: Message = {
              id: Date.now().toString(),
              role: 'model',
              content: `✅ I have automatically routed and booked your priority slot for: ${nextSessionDisplay} at ${branchLocation}. Please bring your NRIC.`,
              timestamp: new Date()
          };
          setMessages(prev => [...prev, confirmMsg]);
      }, 2000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing, isGeneratingVoice]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl overflow-hidden relative">
      {/* Header */}
      <div className="bg-red-600 text-white p-4 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-full shadow-sm ring-2 ring-white/20">
                <div className="rounded-full overflow-hidden h-8 w-8 flex items-center justify-center bg-white">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/a/a4/Lion_Head_Symbol_of_Singapore.svg" alt="SG Lion" className="h-7 w-7" />
                </div>
            </div>
            <div>
                <h2 className="font-bold text-lg leading-tight">MPS Connect</h2>
                <div className="flex flex-col">
                     <p className="text-xs text-red-100">{constituency}</p>
                     {division && <p className="text-[10px] font-medium text-red-200 uppercase tracking-wider">{division} Division</p>}
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1 bg-red-700 px-3 py-1.5 rounded-full text-xs border border-red-500">
            <ShieldCheck size={14} /> <span className="hidden sm:inline">Secure</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'}`}>
                {msg.attachments && msg.attachments.map((att, idx) => (
                    // Only show images in chat bubble, audio is hidden/implicit
                    att.startsWith('data:image') && <img key={idx} src={att} alt="attachment" className="mb-2 rounded-lg max-h-40 border border-white/20" />
                ))}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {isProcessing && (
             <div className="flex justify-start">
                <div className="bg-white text-gray-500 border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" /> <span className="text-sm">Processing Audio...</span>
                </div>
             </div>
        )}
        {isGeneratingVoice && !isProcessing && (
            <div className="flex justify-start">
                <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-2 animate-pulse">
                    <Sparkles className="h-4 w-4" /> <span className="text-xs font-semibold">Generating HD Voice Response...</span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white p-4 border-t border-gray-200">
        
        {isRecording && (
            <div className="mb-4 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-red-600 rounded-full animate-ping"></div>
                    <span className="text-red-700 font-bold text-sm">Recording Voice Message...</span>
                </div>
                <button 
                    onClick={stopRecordingForReview}
                    className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-red-700"
                >
                    STOP & REVIEW
                </button>
            </div>
        )}

        {isDictating && (
             <div className="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-3">
                    <Mic className="h-4 w-4 text-blue-600 animate-pulse" />
                    <span className="text-blue-700 font-bold text-sm">Dictating ({DICTATION_LANGUAGES.find(l => l.code === dictationLang)?.label})...</span>
                </div>
                <button 
                    onClick={stopDictation}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700"
                >
                    DONE
                </button>
            </div>
        )}

        {isEncoding && (
             <div className="mb-4 bg-yellow-50 border border-yellow-100 p-3 rounded-xl flex items-center justify-center animate-pulse">
                <div className="flex items-center gap-3">
                    <Loader2 className="animate-spin text-yellow-600" size={16} />
                    <span className="text-yellow-700 font-bold text-sm">Processing Audio...</span>
                </div>
            </div>
        )}

        {/* INPUT MODE / REVIEW MODE SWITCHER */}
        {recordedAudio ? (
            // --- REVIEW RECORDING UI ---
            <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
                <div className="flex items-center justify-between bg-red-50 border border-red-100 p-3 rounded-xl">
                    <div className="flex items-center gap-3 w-full">
                        <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                             <Mic2 className="text-red-600" size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold text-gray-900 mb-1">Review Recording</p>
                             <audio controls src={recordedAudio} className="w-full h-8" />
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setRecordedAudio(null)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-sm transition-colors"
                    >
                        <RefreshCcw size={16} /> Re-record
                    </button>
                    <button 
                        onClick={() => { handleSend(recordedAudio); setRecordedAudio(null); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg font-bold text-sm shadow-md transition-colors"
                    >
                        <Send size={16} /> Confirm & Send
                    </button>
                </div>
            </div>
        ) : (
            // --- STANDARD INPUT UI ---
            <>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                        <button 
                            onClick={() => { setInputMode('audio'); stopDictation(); }}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${inputMode === 'audio' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Mic2 size={12} /> Voice Msg (AI)
                        </button>
                        <button 
                            onClick={() => { setInputMode('dictation'); if(isRecording) stopRecordingForReview(); }}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${inputMode === 'dictation' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Keyboard size={12} /> Live Dictation
                        </button>
                    </div>
                    
                    {inputMode === 'dictation' && (
                        <div className="flex gap-1">
                             {DICTATION_LANGUAGES.map(lang => (
                                 <button
                                    key={lang.code}
                                    onClick={() => setDictationLang(lang.code)}
                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${dictationLang === lang.code ? 'bg-blue-100 border-blue-200 text-blue-700 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                 >
                                     {lang.short}
                                 </button>
                             ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    {file && (
                        <div className="relative mb-2 w-fit">
                             {file.startsWith('data:image') ? (
                                <img src={file} alt="Preview" className="h-32 w-auto max-w-[200px] object-cover rounded-xl" />
                             ) : (
                                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200"><FileText size={20} /> <span className="text-xs">Document</span></div>
                             )}
                            <button onClick={() => setFile(null)} className="absolute -top-2 -right-2 bg-gray-900 text-white p-1 rounded-full"><X size={12} /></button>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                        <label className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
                            <Paperclip size={20} className="text-gray-500" />
                        </label>
                        
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={inputMode === 'audio' ? "Type or tap Mic to record..." : "Tap mic to start dictating..."}
                            className="flex-1 bg-gray-50 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                            disabled={isRecording}
                        />

                        <button 
                            onClick={() => setIsTTSActive(!isTTSActive)}
                            className={`p-2 rounded-full transition-all ${isTTSActive ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}
                            title={isTTSActive ? "HD Voice Active" : "Voice Muted"}
                        >
                            {isTTSActive ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </button>

                        <button 
                            onClick={handleMicClick}
                            className={`p-2 rounded-full transition-all shadow-sm ${
                                isRecording ? 'bg-red-600 text-white animate-pulse' : 
                                isDictating ? 'bg-blue-600 text-white animate-pulse' :
                                'hover:bg-gray-100 text-gray-500'
                            }`}
                        >
                            {(isRecording || isDictating) ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
                        </button>

                        <button onClick={() => handleSend()} disabled={!inputText.trim() && !file && !isRecording} className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 disabled:opacity-50">
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </>
        )}

        <div className="mt-2 flex justify-between items-center">
            <p className="text-[10px] text-gray-400">
                {inputMode === 'audio' 
                    ? "Audio sent directly to AI for context analysis." 
                    : "Live text dictation via browser engine."}
            </p>
            <button onClick={() => onCompleteSession(messages)} className="text-xs font-bold text-blue-600 hover:underline px-2 py-1">Complete & Submit Case</button>
        </div>
      </div>

      {/* --- URGENT BOOKING MODAL --- */}
      {showBookingModal && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                  {!bookingConfirmed ? (
                    <>
                        <div className="bg-red-600 p-4 text-white">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Sparkles className="animate-pulse" size={20} />
                                Priority Queue Activated
                            </h3>
                            <p className="text-red-100 text-xs mt-1">
                                We've routed you to your nearest MPS branch.
                            </p>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-700 font-medium mb-4">
                                Confirm your urgent physical slot at:
                            </p>
                            
                            <div className="space-y-3">
                                <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                                    <div className="flex gap-3">
                                        <div className="bg-white p-2 rounded-lg shadow-sm h-fit">
                                            <MapPin size={20} className="text-red-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-red-500 font-bold uppercase mb-0.5">Assigned Branch</p>
                                            <p className="text-sm font-bold text-gray-900 leading-tight">{branchLocation || 'General Office'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-3">
                                        <div className="bg-white p-2 rounded-lg shadow-sm h-fit">
                                            <Calendar size={20} className="text-red-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-red-500 font-bold uppercase mb-0.5">Next Available Session</p>
                                            <p className="text-sm font-bold text-gray-900 leading-tight">{nextSessionDisplay}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex gap-3">
                                <button 
                                    onClick={() => setShowBookingModal(false)}
                                    className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleConfirmBooking}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold shadow-lg"
                                >
                                    Confirm Slot
                                </button>
                            </div>
                        </div>
                    </>
                  ) : (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 animate-in zoom-in">
                            <CheckCircle2 size={32} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg">Booking Confirmed</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            An SMS confirmation has been sent to your registered mobile number.
                        </p>
                    </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default ResidentView;