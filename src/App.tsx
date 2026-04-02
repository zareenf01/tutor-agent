import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { 
  Upload, 
  Send, 
  PlusCircle, 
  RefreshCw, 
  FileText, 
  User, 
  Bot, 
  Volume2, 
  X,
  Paperclip,
  AlertCircle,
  Square
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  audio?: string;
  isError?: boolean;
}

interface UploadedFile {
  name: string;
  type: string;
  preview?: string;
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem("tutor_session_id"));
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(() => {
    const saved = localStorage.getItem("tutor_uploaded_file");
    return saved ? JSON.parse(saved) : null;
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("tutor_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(!sessionId);
  const [error, setError] = useState<string | null>(null);
  const [isQuizActive, setIsQuizActive] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("tutor_session_id", sessionId);
    } else {
      localStorage.removeItem("tutor_session_id");
      localStorage.removeItem("tutor_uploaded_file");
      localStorage.removeItem("tutor_messages");
    }
  }, [sessionId]);

  useEffect(() => {
    if (uploadedFile) {
      localStorage.setItem("tutor_uploaded_file", JSON.stringify(uploadedFile));
    }
  }, [uploadedFile]);

  useEffect(() => {
    localStorage.setItem("tutor_messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const { sessionId: newSessionId } = response.data;
      
      setSessionId(newSessionId);
      setUploadedFile({
        name: file.name,
        type: file.type,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
      });
      setIsUploading(false);
      setShowUploadModal(false);
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to upload file. Please try again.");
      setIsUploading(false);
    }
  };

  const isQuizRequest = (text: string) => {
    const lowerText = text.toLowerCase();
    // Match anything containing the word "quiz"
    if (lowerText.includes("quiz")) return true;
    // Also catch related phrases
    const keywords = ["test me", "test my knowledge", "practice questions", "practice test", "trivia"];
    return keywords.some(keyword => lowerText.includes(keyword));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isGenerating || !sessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: inputText,
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText("");
    setIsGenerating(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let response;
      if (isQuizRequest(currentInput) && !isQuizActive) {
        // Start a new quiz
        response = await axios.post(`${API_BASE_URL}/quiz/start`, {
          sessionId,
        }, { signal: controller.signal });
        setIsQuizActive(true);
      } else if (isQuizActive) {
        // Submit answer to ongoing quiz
        response = await axios.post(`${API_BASE_URL}/quiz/answer`, {
          sessionId,
          answer: currentInput,
        }, { signal: controller.signal });
        // If the response signals quiz is done, deactivate quiz mode
        const answerReply: string = response.data?.tutorMessage || response.data?.tutorReply || "";
        if (
          answerReply.toLowerCase().includes("quiz complete") ||
          answerReply.toLowerCase().includes("quiz finished") ||
          answerReply.toLowerCase().includes("that's all") ||
          answerReply.toLowerCase().includes("no more questions") ||
          (response.data?.currentQuestion && response.data?.totalQuestions &&
            response.data.currentQuestion > response.data.totalQuestions)
        ) {
          setIsQuizActive(false);
        }
      } else {
        // Regular chat
        response = await axios.post(`${API_BASE_URL}/chat`, {
          sessionId,
          message: currentInput,
        }, { signal: controller.signal });
      }

      const { tutorReply, tutorMessage, url } = response.data;
      const replyText = tutorMessage || tutorReply || "I've processed your request.";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: replyText,
        audio: url,
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
      setIsGenerating(false);
      
      if (url) {
        stopAudio();
        const audioObj = new Audio(url);
        audioRef.current = audioObj;
        audioObj.play().catch(e => console.log("Audio playback blocked or failed", e));
      }
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log("Request canceled");
        return;
      }
      console.error("API call failed:", err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "I'm sorry, I encountered an error while processing your request. Please try again.",
        isError: true
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsGenerating(false);
    }
  };

  const startNewChat = () => {
    stopAudio();
    setMessages([]);
    setIsQuizActive(false);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAudio();
    setIsGenerating(false);
  };

  const uploadNewFile = () => {
    stopAudio();
    setSessionId(null);
    setUploadedFile(null);
    setMessages([]);
    setIsQuizActive(false);
    setShowUploadModal(true);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans selection:bg-blue-100">
      <AnimatePresence>
        {sessionId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col min-h-screen"
          >
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md z-40 flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="text-white w-5 h-5" />
                </div>
                <h1 className="font-semibold text-lg tracking-tight">Tutor Agent</h1>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={startNewChat}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-full transition-all"
                >
                  <PlusCircle className="w-4 h-4" />
                  New Chat
                </button>
                <button 
                  onClick={uploadNewFile}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 rounded-full transition-all shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload New
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main className="pt-24 pb-48 max-w-3xl mx-auto px-6 min-h-screen flex-1 flex flex-col w-full">
              {messages.length === 0 && !isGenerating && (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-2">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h2 className="text-xl font-medium">Ready to learn?</h2>
                  <p className="max-w-xs">Ask anything about your uploaded file "{uploadedFile?.name}"</p>
                </div>
              )}

              <div className="space-y-8">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === "user" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"
                      }`}>
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "text-right" : ""}`}>
                        <div className={`inline-block px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${
                          msg.role === "user" 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : msg.isError 
                              ? "bg-red-50 border border-red-100 text-red-600 rounded-tl-none"
                              : "bg-white border border-gray-100 shadow-sm rounded-tl-none"
                        }`}>
                          {msg.text}
                        </div>
                        {msg.audio && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Volume2 className="w-3 h-3 animate-pulse" />
                            Playing audio response...
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-1.5 h-10 px-4 bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-none">
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.15 }}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.3 }}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                      />
                    </div>
                  </motion.div>
                )}
              </div>
              {/* Spacer to prevent overlap with fixed input area */}
              <div className="h-12" />
              <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-10 pb-8 px-6 z-30">
              <div className="max-w-3xl mx-auto relative">
                <form 
                  onSubmit={handleSendMessage}
                  className="relative bg-white border border-gray-200 rounded-2xl shadow-lg focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50/50 transition-all overflow-hidden flex flex-col"
                >
                  {/* File Preview inside Input */}
                  {uploadedFile && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/50 border-b border-gray-100 text-xs font-medium text-gray-500">
                      {uploadedFile.preview ? (
                        <img src={uploadedFile.preview} className="w-5 h-5 object-cover rounded border border-gray-200" referrerPolicy="no-referrer" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="truncate max-w-[200px]">{uploadedFile.name}</span>
                    </div>
                  )}

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={isQuizActive ? "Type your answer..." : "Ask your tutor anything..."}
                    className="w-full px-5 py-4 pr-14 bg-transparent outline-none resize-none text-[15px] min-h-[60px] max-h-32"
                    rows={1}
                  />
                  <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    {isGenerating ? (
                      <button
                        type="button"
                        onClick={stopGeneration}
                        className="p-2.5 rounded-xl bg-gray-900 text-white shadow-lg hover:bg-black hover:shadow-xl active:scale-95 transition-all border border-white/10 group"
                        title="Stop generating"
                      >
                        <Square className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!inputText.trim() || isGenerating}
                        className={`p-2.5 rounded-xl transition-all ${
                          inputText.trim() && !isGenerating
                            ? "bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl active:scale-95"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </form>
                <p className="text-[11px] text-center text-gray-400 mt-3">
                  Tutor AI can make mistakes. Verify important information.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="fixed inset-0 flex items-center justify-center bg-white">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-medium text-gray-400">Waiting for lesson upload...</h2>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => sessionId && setShowUploadModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Upload Lesson</h2>
                    <p className="text-gray-500 mt-1">Upload a file to start your learning session.</p>
                  </div>
                  {sessionId && (
                    <button 
                      onClick={() => setShowUploadModal(false)}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  )}
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                  </div>
                )}

                <div 
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`
                    group relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer
                    ${isUploading ? "bg-gray-50 border-gray-200" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/30"}
                  `}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,image/*"
                  />
                  
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-4">
                      <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
                      <div className="text-center">
                        <p className="font-medium">Uploading & Analyzing...</p>
                        <p className="text-xs text-gray-400 mt-1">Creating your session ID</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-7 h-7" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-gray-400 mt-1">PDF, DOC, TXT or Images (Max 10MB)</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8 flex items-center gap-3 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Paperclip className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    Your files are processed securely to provide personalized tutoring.
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}