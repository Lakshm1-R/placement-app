import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import toast from "react-hot-toast";
import axios from "axios";

const Login = () => {
  const API_BASE = process.env.REACT_APP_API_BASE;
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    // Check if user came from registration
    const urlParams = new URLSearchParams(location.search);
    const registeredEmail = urlParams.get("email");
    const registeredName = urlParams.get("name");

    if (registeredEmail && registeredName) {
      setUserInfo({
        email: registeredEmail,
        name: registeredName,
      });
      setFormData((prev) => ({ ...prev, email: registeredEmail }));
    }
  }, [location]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await login(formData.email, formData.password);
      const { user } = response;
      
      toast.success('Login successful!');
      
      // Handle different role redirections
      if (user.role === 'placement_representative') {
        // Check profile completion first
        if (!user.profile?.isProfileComplete) {
          navigate('/pr-profile-setup');
        } 
        // Check placement consent
        else if (!user.placementPolicyConsent?.hasAgreed) {
          navigate('/placement-consent');
        }
        // Check OTP verification
        else if (!user.verificationStatus?.otpVerified) {
          navigate('/otp-verification');
        }
        // All checks passed, go to PR dashboard
        else {
          navigate('/pr-dashboard');
        }
      } else if (user.role === 'student') {
        // Check profile completion first
        if (!user.profile?.isProfileComplete) {
          navigate('/complete-profile');
        } 
        // Check placement consent
        else if (!user.placementPolicyConsent?.hasAgreed) {
          navigate('/placement-consent');
        }
        // Check OTP verification
        else if (!user.verificationStatus?.otpVerified) {
          navigate('/otp-verification');
        }
        // All checks passed, go to dashboard
        else {
          navigate('/dashboard');
        }
      } else if (user.role === 'placement_officer' || user.role === 'po') {
        navigate('/po-dashboard');
      } else {
        navigate('/dashboard');
      }
      
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || 'Login failed';
      toast.error(errorMessage);
      
      if (error.response?.data?.needsVerification) {
        setShowResendVerification(true);
        setResendEmail(formData.email);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setLoading(true);
      console.log("Resending verification to:", resendEmail);

      await axios.post(`${API_BASE}/api/auth/resend-verification`, {
        email: resendEmail,
      });

      toast.success("Verification email sent! Please check your inbox.");
      setShowResendVerification(false);
    } catch (error) {
      console.error("Resend verification error:", error);

      if (!error.response) {
        toast.error(
          "Network error. Please check your connection and try again."
        );
      } else {
        toast.error(
          error.response?.data?.message || "Failed to send verification email"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="card-white p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 lavender-gradient rounded-xl mx-auto mb-4 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Campus Placement Portal
          </h2>
          {userInfo ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-green-500 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-green-800 font-medium">
                  Registration Successful!
                </span>
              </div>
              <p className="text-green-700 text-sm">
                Welcome <strong>{userInfo.name}</strong>! Your account has been
                created.
              </p>
              <p className="text-green-600 text-xs mt-1">
                Please check your email ({userInfo.email}) for verification
                link, then login below.
              </p>
            </div>
          ) : (
            <p className="text-gray-600">Sign in to your account</p>
          )}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all duration-300"
              placeholder="Enter your email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all duration-300"
              placeholder="Enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {showResendVerification && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2">
              Didn't receive the verification email?
            </p>
            <button
              onClick={handleResendVerification}
              className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        <div className="text-center mt-6">
          <Link
            to="/register"
            className="text-violet-600 hover:text-violet-800 transition-colors duration-300 text-sm font-medium"
          >
            Don't have an account? Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;












