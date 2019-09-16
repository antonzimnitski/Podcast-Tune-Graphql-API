import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

import { transport, makeANiceEmail } from '../../mail';

export default {
  async register(parent, { email, password, name }, ctx, info) {
    if (!email || email.trim().length === 0) {
      throw new Error(`Email is not provided.`);
    }

    if (!password || password.trim().length === 0) {
      throw new Error(`Password is not provided.`);
    }

    const emailLC = email.toLowerCase();

    const userExists = await ctx.db.exists.User({
      email,
    });

    if (userExists) {
      throw new Error(`Email is already found in our database`);
    }

    const encryptedPassword = await bcrypt.hash(password, 10);

    const user = await ctx.db.mutation.createUser(
      {
        data: {
          email: emailLC,
          name,
          password: encryptedPassword,
          permissions: { set: ['USER'] },
        },
      },
      info
    );

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });

    return user;
  },
  async login(parent, { email, password }, ctx, info) {
    if (!email || email.trim().length === 0) {
      throw new Error(`Email is not provided.`);
    }

    if (!password || password.trim().length === 0) {
      throw new Error(`Password is not provided.`);
    }

    const user = await ctx.db.query.user({
      where: {
        email,
      },
    });

    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new Error('Invalid Password!');
    }

    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });

    return user;
  },
  logout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye!' };
  },
  async requestReset(parent, { email }, { db }, info) {
    if (!email || email.trim().length === 0) {
      throw new Error(`Email is not provided.`);
    }

    const user = await db.query.user({ where: { email } });

    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }

    const randomBytesPromiseified = promisify(randomBytes);
    const resetToken = (await randomBytesPromiseified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await db.mutation.updateUser({
      where: { email },
      data: { resetToken, resetTokenExpiry },
    });

    const mailRes = await transport.sendMail({
      from: 'help@podcasttune.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(`Your Password Reset Token is here!
    \n\n
    <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a>`),
    });

    return { message: 'Thanks!' };
  },
  async resetPassword(
    parent,
    { password, confirmPassword, resetToken },
    { db, response },
    info
  ) {
    if (!password || password.trim().length === 0) {
      throw new Error(`Password is not provided.`);
    }

    if (!confirmPassword || confirmPassword.trim().length === 0) {
      throw new Error(`Password confirmation is not provided.`);
    }

    if (password !== confirmPassword) {
      throw new Error("Yo Passwords don't match!");
    }

    const [user] = await db.query.users({
      where: {
        resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    });
    if (!user) {
      throw new Error('This token is either invalid or expired!');
    }

    const newPassword = await bcrypt.hash(password, 10);

    const updatedUser = await db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password: newPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);

    response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });

    return updatedUser;
  },
};
