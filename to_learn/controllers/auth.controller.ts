import { Request, RequestHandler, Response } from "express";
import bcrypt from "bcrypt";
import { UserRepository } from "../repository/user.repository";
import MailService from "../services/email.service";
import { CacheService } from "../services/cache.service";
import logger from "../configs/winston.config";
import { error } from "console";
import { decodeToken, generateAccessToken, generateOtpToken, generateRefreshToken } from "../services/jwt.service";
import { sendEmailWithTemplate } from "../services/sendgrid.service";
import { FORGOT_PASSWORD_TEMPLATE_ID, FRONTEND_BASEURL } from "../configs/env.config";

const userRepository: UserRepository = new UserRepository();
const cache: CacheService = new CacheService();

// const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
export class AuthController {
    public async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req?.body;

            let user: any = await userRepository?.getUserByKey("email", email.toLowerCase());
            console.log("Scout==>", user);

            if (!user) {
                logger.error(`Login : User with email ${email} does not exist`);
                console.log("Login : User with email ${email} does not exist");
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "User does not exist",
                        error: "user does not exist",
                    });
                return;
            }

            if(user?.userRole?.name === 'groupLeader' && user?.isVerified == false){
                logger.error(`Login : User with email ${email} is not verified`);
                console.log("Login : User with email ${email} is not verified");
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "User is not verified",
                        error: "user is not verified",
                    });
                return;
            }

            const isMatch = await bcrypt.compare(password, user?.password);

            if (!isMatch) {
                logger.error(
                    `Login : Invalid credentials for user with email ${email}`,
                );
                console.log(`Login : Invalid credentials for user with email ${email}`);
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "Oops, the email and password combination are incorrect. Please try again",
                        error: "Oops, the email and password combination are incorrect. Please try again",
                    });
                return;
            }

            const accessToken = generateAccessToken({email: user?.email});
            const refreshToken = generateRefreshToken({email: user?.email});

            console.log("accessToken",accessToken)
            console.log("refreshToken",refreshToken)


            const tokenUpdate = await userRepository?.updateToken(user?._id?.toString(), accessToken, refreshToken);

            // Set tokens in HTTP-only cookies
            res.cookie("accessToken", accessToken, { httpOnly: true, secure: true, sameSite: "none", maxAge: 32 * 60 * 60 * 1000, }); // 32 hours
            res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: true, sameSite: "none", maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days

            console.log("Token Update>>",tokenUpdate);
            const { password: pass, ...sanitizedUser } = tokenUpdate;

            console.log("sanitizedUser", sanitizedUser)

            logger.info(`Login : User with email ${email} logged in successfully`);
            console.log(`Login : User with email ${email} logged in successfully`);
            res
                .status(200)
                .json({
                    success: true,
                    data: tokenUpdate,
                    message: "Logged in successfully",
                    error: null,
                });
        } catch (err: any) {
            console.error("Login : Internal server error", err?.message);
            logger.error(`Login : Internal server error: ${err?.message}`);
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: err.message,
            });
        }
    }


    public async forgotPassword(req: Request, res: Response): Promise<void> {
        try {
            const { email } = req?.body;

            let user = await userRepository?.getUserByKey("email", email.toLowerCase());
            console.log("Scout==>", user);

            if (!user) {
                logger.error(
                    `Forgot Password : User with email ${email} does not exist`,
                );
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "User does not exist",
                        error: null,
                    });
                return;
            }

            const OTP = Math.floor(1000 + Math.random() * 9000)?.toString();

            const token = generateOtpToken(email.toLowerCase());

            const otpLink = `${FRONTEND_BASEURL}/otp-verification?token=${token}`;

            //const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "5m" });

            // send email with password reset link
            // await new MailService()?.sendOtp(email, OTP);
            await sendEmailWithTemplate(email.toLowerCase(), FORGOT_PASSWORD_TEMPLATE_ID, { otp: OTP , otpLink: otpLink });
            logger.info(`Forgot Password : OTP sent to email ${email}`);
            console.log(`Forgot Password : OTP sent to email ${email}`);

            // Store OTP in the in-memory cache
            cache.set(email.toLowerCase(), { otp: OTP, expiresAt: Date.now() + 5 * 60 * 1000 });
            logger.info(`Forgot Password : OTP sent to email ${email}`);
            res
                .status(200)
                .json({ success: true, data: null, message: `OTP sent to email` });
        } catch (err: any) {
            console.error("Forgot Password : Internal server error", err?.message);
            logger.error(`Forgot Password : Internal server error: ${err?.message}`);
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: err?.message,
            });
        }
    }

    public async verifyOtp(req: Request, res: Response): Promise<void> {
        try {
            const { email, otp } = req?.body;

            const cachedData: { otp: string, expiresAt: number } = cache.get(email.toLowerCase()); // delete the OTP from cache

            console.log("Cached===>", cachedData);

            if (!cachedData) {
                logger.error(`Verify OTP : OTP not found for email ${email}`);
                console.error(`Verify OTP : OTP not found for email ${email}`);
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "OTP expired",
                        error: null,
                    });
                return;
            }

            if (Date.now() > new Date(cachedData.expiresAt).getTime()) {
                logger.error(`Verify OTP : OTP expired for email ${email}`);
                console.error("Verify OTP : OTP expired for email ${email}");
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "OTP Expired!",
                        error: null,
                    });
                return;
            }

            if (cachedData?.otp !== otp) {
                logger.error(`Verify OTP : OTP does not match for email ${email}`);
                console.error(`Verify OTP : OTP does not match for email ${email}`);
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "Oops, that code does not match. Please check your code and retry",
                        error: null,
                    });
                return;
            }

            if (cachedData?.otp == otp) {

                cache.del(email.toLowerCase()); // delete the OTP from cache
                // set new cache for password reset
                cache.set(email.toLowerCase(), { verified: true, resetValidity: Date.now() + 5 * 60 * 1000 });

                logger.info(`Verify OTP : OTP verified for email ${email}`);
                console.log(`Verify OTP : OTP verified for email ${email}`);
            }




            res
                .status(200)
                .json({
                    success: true,
                    data: null,
                    message: "OTP verified successfully",
                    error: null,
                });
        } catch (err: any) {
            console.error("Verify OTP : Internal server error", err?.message);
            logger.error(`Verify OTP : Internal server error: ${err?.message}`);
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: err?.message,
            });
        }
    }

    public async createPassword(req: Request, res: Response): Promise<void> {
        const { email, newPassword } = req?.body;
        const { changePassword } = req.query;
        const { verified } = req?.query;

        const cachedData = cache.get(email.toLowerCase());

        try {

            if (!cachedData && changePassword?.toString() !== 'true') {
                logger.error(`Create Password : OTP expired for email ${email}`);
                console.error(`Create Password : OTP expired for email ${email}`);
                res.status(400).json({ success: false, data: null, navigate:true ,message: 'OTP expired', error: null });
                return;
            }
            let user = await userRepository?.getUserByKey("email", email.toLowerCase());

            if (changePassword) {
                const { oldPassword } = req?.body;


                if (!user) {
                    logger.error(
                        `Create Password : User with email ${email} does not exist`,
                    );
                    console.error(`Create Password : User with email ${email} does not exist`);
                    res
                        .status(400)
                        .json({
                            success: false,
                            data: null,
                            message: "User does not exist",
                            error: null,
                        });
                    return;
                }

                const isMatch = await bcrypt.compare(oldPassword, user?.password);

                if (!isMatch) {
                    logger.error(
                        `Create Password : Invalid credentials for user with email ${email}`,
                    );
                    console.error(`Create Password : Invalid credentials for user with email ${email}`);
                    res
                        .status(401)
                        .json({
                            success: false,
                            data: null,
                            message: "Invalid credentials",
                            error: null,
                        });
                    return;
                }
            }

            const updatedUser = await userRepository?.updateUser(email.toLowerCase(), {
                password: newPassword,
                isVerified: verified ? true : user?.isVerified
            });

            console.log("updatedUser==>", updatedUser);

            if (!updatedUser) {
                logger.error(
                    `Create Password : Unable to update password for email ${email}`,
                );
                console.error(`Create Password : Unable to update password for email ${email}`);
                res
                    .status(400)
                    .json({
                        success: false,
                        data: null,
                        message: "User does not exist",
                        error: null,
                    });
                return;
            }

            // delete the OTP from cache
            cache.del(email.toLowerCase()); // delete the OTP from cache

            logger.info(
                `Create Password : Password reset successfully for email ${email}`,
            );
            console.log(`Create Password : Password reset successfully for email ${email}`);
            res
                .status(200)
                .json({
                    success: true,
                    data: null,
                    message: "Password change successfully",
                    error: null,
                });
            return;

        } catch (err: any) {
            console.error("Create Password  : Internal server error", err?.message);
            logger.error(`Create Password : Internal server error: ${err?.message}`);
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: err?.message,
            });
        }
    }

    public async refresh(req: Request, res: Response): Promise<void> {
        try {
            const refreshToken = req?.cookies?.refreshToken;
            const userId = req?.params?.id;

            console.log("refreshToken",refreshToken);
            console.log("userId",userId);

            if (!refreshToken) {
                res.status(401).json({success:false, message: "No refresh token provided", error:null });
                return;
            }

            // Verify refresh token
            try {
                var decoded: any = decodeToken(refreshToken);
                console.log("Decoded",decoded);
            } catch (err:any) {
                res.status(401).json({
                    success: false,
                    refreshToken: true, // Flag for frontend to trigger logout
                    message: "Refresh token expired or invalid",
                    error: err?.message
                });
                return;
            }

            const user: any = await userRepository.getUserByKey('_id', userId);

            if (!user || user?.refreshToken !== refreshToken) {
                res.status(403).json({ message: "Invalid refresh token" });
                return;
            }

            // Generate new access token
            const newAccessToken = generateAccessToken({ id: user?._id });

            res.cookie("accessToken", newAccessToken, { httpOnly: true, secure: true, sameSite: "none", maxAge: 60 * 60 * 1000, });

            const updateToken = await userRepository.updateToken(userId, newAccessToken, refreshToken);

            if (updateToken) {
                res.status(200).json({
                    success: true, 
                    data: null, 
                    message:"Token updated successfully",
                    error: null,
                });
            } else {
                res.status(500).json({
                    success: false,
                    data: null,
                    message: "internal server error",
                    error: "Error while generating token",
                });
            }

        } catch (err: any) {
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: "Error while generating token",
            });
        }
    }

    public async logout(req: Request, res: Response): Promise<void> {
        try {
            const userId = req?.params?.id;

            console.log("Logout : userId ===>", userId);

            const user: any = await userRepository.getUserByKey('_id', userId);

            if (user) {
                res.clearCookie("accessToken");
                res.clearCookie("refreshToken");
                await userRepository.updateToken(userId, "", "");
            }

            console.log("User Logged Out");
            logger.info(`Logout : User Logged out successfully - ${userId}`)

            res.status(200).json({
                success: true, 
                data: null, 
                message:"Logged out successfully",
                error: null,
            });
        } catch (err:any) {
            logger.info(`Logout : Internal server error - ${err?.message}`)
            res.status(500).json({
                success: false,
                data: null,
                message: "internal server error",
                error: err?.message,
            });
        }
    }
}
