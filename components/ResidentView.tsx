import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { sendMessage } from '../services/aiService';
import { Send, Paperclip, Loader2, ShieldCheck, X, FileText, Sparkles, Calendar, CheckCircle2, MapPin } from 'lucide-react';

interface ResidentViewProps {
  onCompleteSession: (messages: Message[]) => void;
  userName: string;
  mpName: string;
  constituency: string;
  division?: string;
  branchLocation?: string;
  mpsSchedule?: string;
}

function getNextSessionDate(schedule?: string): string {
    if (!schedule) return "Next Session";
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const targetDayIndex = days.findIndex(d => schedule.includes(d));
    if (targetDayIndex === -1) return "Next Scheduled Session";
    const currentDayIndex = today.getDay();
    let daysUntil = targetDayIndex - currentDayIndex;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    const timeMatch = schedule.match(/(\d{1,2}(?:\.\d{2})?\s?(?:AM|PM))/i);
    const timeStr = timeMatch ? `, ${timeMatch[0]}` : '';
    return `${nextDate.toLocaleDateString('en-SG', options)}${timeStr}`;
}

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
      content: `Hello ${userName}, I am the Digital Assistant for ${mpName}. I can understand English, Mandarin, Malay, Tamil, and Singlish. How can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<string | null>(null);

  // Urgent Booking State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [nextSessionDisplay, setNextSessionDisplay] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      setNextSessionDisplay(getNextSessionDate(mpsSchedule));
  }, [mpsSchedule]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onloadend = () => { setFile(reader.result as string); };
        reader.readAsDataURL(selectedFile);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && !file) return;
    if (isProcessing) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      attachments: file ? [file] : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    const sentText = inputText;
    const sentFile = file;
    setInputText('');
    setFile(null);
    setIsProcessing(true);

    try {
      let responseText = await sendMessage(
          messages,
          sentText + (sentFile ? " [Image Attached]" : ""),
          mpName,
          constituency,
          division,
          sentFile ? [sentFile] : undefined
      );

      if (responseText.includes("||URGENT_BOOKING||")) {
          setShowBookingModal(true);
          responseText = responseText.replace("||URGENT_BOOKING||", "").trim();
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmBooking = () => {
      setBookingConfirmed(true);
      setTimeout(() => {
          setShowBookingModal(false);
          setBookingConfirmed(false);
          const confirmMsg: Message = {
              id: Date.now().toString(),
              role: 'model',
              content: `✅ I have automatically routed and booked your priority slot for: ${nextSessionDisplay} at ${branchLocation}. Please bring your NRIC.`,
              timestamp: new Date()
          };
          setMessages(prev => [...prev, confirmMsg]);
      }, 2000);
  };

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
                    att.startsWith('data:image') && <img key={idx} src={att} alt="attachment" className="mb-2 rounded-lg max-h-40 border border-white/20" />
                ))}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {isProcessing && (
             <div className="flex justify-start">
                <div className="bg-white text-gray-500 border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" /> <span className="text-sm">Thinking...</span>
                </div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white p-4 border-t border-gray-200">
        {file && (
            <div className="relative mb-3 w-fit">
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
                placeholder="Type your concern in any language..."
                className="flex-1 bg-gray-50 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
            />

            <button
                onClick={handleSend}
                disabled={!inputText.trim() && !file}
                className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
                <Send size={20} />
            </button>
        </div>

        <div className="mt-2 flex justify-between items-center">
            <p className="text-[10px] text-gray-400">Supports English · 中文 · Bahasa · தமிழ் · Singlish</p>
            <button onClick={() => onCompleteSession(messages)} className="text-xs font-bold text-blue-600 hover:underline px-2 py-1">Complete & Submit Case</button>
        </div>
      </div>

      {/* Urgent Booking Modal */}
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
                            <p className="text-red-100 text-xs mt-1">We've routed you to your nearest MPS branch.</p>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-700 font-medium mb-4">Confirm your urgent physical slot at:</p>
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                                <div className="flex gap-3">
                                    <div className="bg-white p-2 rounded-lg shadow-sm h-fit"><MapPin size={20} className="text-red-600" /></div>
                                    <div>
                                        <p className="text-xs text-red-500 font-bold uppercase mb-0.5">Assigned Branch</p>
                                        <p className="text-sm font-bold text-gray-900 leading-tight">{branchLocation || 'General Office'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="bg-white p-2 rounded-lg shadow-sm h-fit"><Calendar size={20} className="text-red-600" /></div>
                                    <div>
                                        <p className="text-xs text-red-500 font-bold uppercase mb-0.5">Next Available Session</p>
                                        <p className="text-sm font-bold text-gray-900 leading-tight">{nextSessionDisplay}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={() => setShowBookingModal(false)} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                                <button onClick={handleConfirmBooking} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold shadow-lg">Confirm Slot</button>
                            </div>
                        </div>
                    </>
                  ) : (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                            <CheckCircle2 size={32} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg">Booking Confirmed</h3>
                        <p className="text-sm text-gray-500 mt-2">An SMS confirmation has been sent to your registered mobile number.</p>
                    </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default ResidentView;